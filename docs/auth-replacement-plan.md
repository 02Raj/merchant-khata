# OmniBill Auth Replacement Plan
## Firebase Phone OTP → Email/Password (Owner) + Staff PIN (No OTP)

> **Status:** Planning document (implementation not started)  
> **App:** OmniBill (`merchant-desk-app`)  
> **Goal:** Launch/testing ke liye phone OTP cost hatao; industry-standard POS auth lagao  
> **Important:** Phone auth code **delete mat karo** — sirf **comment out** karo. Future mein cheap phone auth wapas enable kar sakte ho.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State (As-Is)](#2-current-state-as-is)
3. [Problem: Kyun Bill Badh Raha Hai](#3-problem-kyun-bill-badh-raha-hai)
4. [Target Architecture (To-Be)](#4-target-architecture-to-be)
5. [Industry Research: POS Apps Kya Karti Hain](#5-industry-research-pos-apps-kya-karti-hain)
6. [Cheap Phone Auth Services (Future Scale)](#6-cheap-phone-auth-services-future-scale)
7. [Implementation Phases](#7-implementation-phases)
8. [Database Changes](#8-database-changes)
9. [File-by-File Change List](#9-file-by-file-change-list)
10. [Phone Auth Comment-Out Strategy](#10-phone-auth-comment-out-strategy)
11. [Security Considerations](#11-security-considerations)
12. [Testing Plan](#12-testing-plan)
13. [Live Launch Checklist](#13-live-launch-checklist)
14. [Future: Phone Auth Wapas Kaise Enable Karein](#14-future-phone-auth-wapas-kaise-enable-karein)
15. [Cost Comparison Table](#15-cost-comparison-table)

---

## 1. Executive Summary

### Abhi kya ho raha hai
Har user (owner + staff + waiter) login ke liye **Firebase Phone OTP** use karta hai. Har OTP = 1 SMS = paisa.

### Kya karna hai
| User Type | New Login Method | SMS Cost |
|-----------|------------------|----------|
| **Shop Owner** | Email + Password (Firebase) | **₹0** |
| **Staff / Waiter** | **Shop PIN** (4–6 digit) on shared device | **₹0** |
| **Account Recovery** (future) | Phone OTP ya email reset link | Rare / optional |

### Phone auth code ka rule
```
❌ DELETE mat karo
✅ COMMENT OUT karo (/* ... */ ya // blocks)
✅ Feature flag se toggle karo: AUTH_MODE = 'email_pin' | 'phone_otp'
```

Live launch pe **phone OTP fully commented** rahega. Code repo mein preserved rahega future ke liye.

---

## 2. Current State (As-Is)

### Auth flow today

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌───────────┐
│ login.tsx   │────▶│ otp.tsx      │────▶│ business-setup  │────▶│ Dashboard │
│ Phone + OTP │     │ 6-digit code │     │ Create / Join   │     │           │
└─────────────┘     └──────────────┘     └─────────────────┘     └───────────┘
       │                    │
       ▼                    ▼
 FirebaseRecaptcha     sendPhoneOtp()
 Firebase Phone Auth   verifyPhoneOtp()
```

### Key files (current)

| File | Role |
|------|------|
| `app/(auth)/login.tsx` | Phone number input + Send OTP |
| `app/(auth)/otp.tsx` | OTP verification screen |
| `components/FirebaseRecaptchaVerifierModal.tsx` | reCAPTCHA for phone auth |
| `lib/auth.ts` | `sendPhoneOtp`, `verifyPhoneOtp`, `signInOwnerWithEmail` (exists but unused in UI) |
| `lib/otpSession.ts` | Pending OTP session storage |
| `lib/firebase.ts` | Firebase init |
| `lib/supabase.ts` | Supabase client — Firebase JWT as `accessToken` |
| `context/AuthContext.tsx` | `onAuthStateChanged` → `userHasBusiness()` |
| `app/(auth)/business-setup.tsx` | Create shop / Join via invite code |

### Supabase identity model

- `business_users.user_id` = Firebase UID (`auth.jwt() ->> 'sub'`)
- RLS: `user_belongs_to_business()` checks Firebase JWT `sub`
- Staff join: `join_business_as_staff(p_code)` — **but staff pehle OTP se login karna padta hai**

### Already half-built (unused)

`lib/auth.ts` mein `signInOwnerWithEmail()` already hai:

```typescript
export async function signInOwnerWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return { session: result.user };
}
```

UI mein expose nahi hai — sirf phone OTP dikh raha hai.

---

## 3. Problem: Kyun Bill Badh Raha Hai

### Firebase Phone Auth pricing (India, 2026)

| Item | Cost |
|------|------|
| Email / Google / Apple sign-in | **Free** (50k MAU tak) |
| Phone SMS OTP (Blaze plan) | **~$0.01–0.07 per SMS** (India ~$0.01–0.07 depending on route) |
| Free tier | Sirf **10 test SMS/day** (test phone numbers pe) |
| Resend OTP | **Har resend = naya charge** |
| Failed OTP (user ne enter nahi kiya) | **Phir bhi billed** |

### Real-world math (POS app)

```
1 shop = 1 owner + 2 staff
Har person roz 2 baar login (shift start/end)
= 3 users × 2 logins × 30 days = 180 OTPs/month/shop

100 shops = 18,000 OTPs/month
@ ₹0.85/SMS (Firebase India) ≈ ₹15,300/month sirf login ke liye

Testing phase (tum + dost + QA):
- Multiple numbers, resends, reinstalls
- Easily ₹3,000–5,000/month (jo tumne dekha)
```

### Kyun testing mein zyada lagta hai
- Har naya tester = naya phone number = naya OTP
- App reinstall = naya login = naya OTP
- Staff invite flow = pehle OTP, phir invite code = **double friction + double cost**

---

## 4. Target Architecture (To-Be)

### New auth flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        LOGIN SCREEN                               │
│  ┌─────────────────────┐    ┌─────────────────────┐              │
│  │  Owner Login        │    │  Staff Login        │              │
│  │  Email + Password   │    │  Shop PIN (4-6 digit)│              │
│  │  [Sign Up link]     │    │  (no OTP, no SMS)   │              │
│  └──────────┬──────────┘    └──────────┬──────────┘              │
└─────────────┼──────────────────────────┼─────────────────────────┘
              │                          │
              ▼                          ▼
     Firebase Email Auth          PIN verified server-side
     (FREE, unlimited)           against staff_profiles table
              │                          │
              ▼                          ▼
     business-setup (create)     Active staff context set
     OR dashboard (existing)      Owner Firebase session retained
```

### Owner journey

```
1. Sign Up → Email + Password + Confirm Password
2. Firebase createUserWithEmailAndPassword()
3. business-setup → Create shop (name, address, type)
4. Dashboard (session persists via AsyncStorage — already works)
5. Settings → Add staff members with name + role + PIN
```

### Staff journey (NO OTP)

```
1. Shop device pe owner already logged in (ya staff PIN screen)
2. Staff taps "Staff Login"
3. Enters 4-6 digit PIN (set by owner in Settings)
4. App switches to staff/waiter context
5. Role-based UI (waiter = Tables only, staff = limited tabs)
6. "Switch User" → PIN screen wapas (logout nahi, session retain)
```

### Invite code ka future

Current 6-digit invite code **owner onboarding ke liye optional** rakh sakte ho:
- **Phase 1 (abhi):** Owner directly staff PIN create kare Settings se
- **Phase 2 (optional):** Invite code + PIN combo for remote staff onboarding

---

## 5. Industry Research: POS Apps Kya Karti Hain

### Pattern comparison

| App | Owner Auth | Staff Auth | Daily OTP? |
|-----|-----------|------------|------------|
| **Vyapar** | Phone (one-time) / Email | Staff PIN on device | ❌ No daily OTP |
| **Khatabook** | Phone OTP (signup only) | Device trust + PIN | ❌ Session-based |
| **Petpooja (Restaurant POS)** | Admin email/password | Waiter PIN / role switch | ❌ PIN-based |
| **Square POS** | Email/password | Staff passcode | ❌ PIN-based |
| **Toast POS** | Email/password | 4-digit employee PIN | ❌ PIN-based |
| **Zomato/Swiggy partner** | Phone OTP | N/A (single user) | ✅ Consumer pattern |

### Industry standard for B2B POS / SaaS

```
┌─────────────────────────────────────────────────┐
│  CONSUMER APPS (Zomato, Paytm)                  │
│  → OTP every login (user owns personal phone)   │
├─────────────────────────────────────────────────┤
│  MERCHANT / POS APPS (Vyapar, Petpooja, Square) │
│  → Owner: email/password (one-time signup)      │
│  → Staff: PIN on shared shop device             │
│  → Session: weeks/months (device trust)         │
│  → OTP: only account recovery (rare)            │
└─────────────────────────────────────────────────┘
```

### Kyun POS apps OTP avoid karti hain

1. **Shared device** — ek tablet pe 5 staff kaam karte hain
2. **High frequency** — din mein 50+ baar app khulti hai
3. **Low connectivity** — SMS delay = billing delay
4. **Cost at scale** — 1000 shops × 3 staff × 2 logins = 6000 OTPs/day

---

## 6. Cheap Phone Auth Services (Future Scale)

> Jab business grow ho aur phone verification chahiye ho (signup verification, recovery), ye options Firebase se saste hain.

### India OTP providers (2026 pricing research)

| Provider | Price/OTP (India) | DLT Compliant | Notes |
|----------|-------------------|---------------|-------|
| **Firebase Phone Auth** | ~$0.01–0.07 (₹0.85–6) | Via Google | Already integrated; expensive at scale |
| **MSG91** | ₹0.15–0.35 | ✅ Yes | Popular in India; good docs |
| **2Factor.in** | ₹0.15–0.25 | ✅ Yes | Simple API; good for startups |
| **SpringEdge** | ₹0.12–0.18 | ✅ Yes | Volume discounts |
| **Techto Networks** | ₹0.16–0.20 | ✅ Yes | Sub-3s delivery SLA |
| **Exotel** | ₹0.20–0.30 | ✅ Yes | Enterprise grade |
| **Twilio Verify** | ~$0.05 (₹4+) | ⚠️ DLT separate | Global; expensive for India |
| **Supabase Phone Auth** | Twilio/MessageBird passthrough | Varies | Requires Supabase Auth migration |

### Cost at 10,000 OTPs/month

| Provider | Approx Cost |
|----------|-------------|
| Firebase | ₹8,500–15,000 |
| MSG91 / 2Factor | ₹1,500–3,500 |
| SpringEdge / Techto | ₹1,200–2,000 |

### Future recommendation (jab phone auth chahiye)

```
Phase A (abhi):     Email + PIN → ₹0
Phase B (1k shops): MSG91/2Factor custom OTP via Edge Function → ₹0.15/OTP
Phase C (10k+):     Volume contract + DLT own entity → ₹0.10/OTP
```

### Custom OTP architecture (future)

```
App → Supabase Edge Function → MSG91 API → SMS
                ↓
         Verify OTP server-side
                ↓
         Issue Firebase custom token OR Supabase session
```

Isse Firebase SMS billing bypass hoti hai; sirf Indian provider pay karte ho.

---

## 7. Implementation Phases

### Phase 0 — Prep (1 day)

- [ ] `docs/auth-replacement-plan.md` review (ye file)
- [ ] `lib/authConfig.ts` banao with feature flag:

```typescript
// lib/authConfig.ts
export const AUTH_MODE = 'email_pin' as 'email_pin' | 'phone_otp';
// Live: 'email_pin'
// Future phone auth testing: 'phone_otp'
```

- [ ] Firebase Console → Email/Password sign-in **Enable** karo
- [ ] Firebase Console → Phone sign-in **Disable** karo (live pe) — code comment, console bhi off

### Phase 1 — Owner Email Login (2–3 days)

#### 1.1 New/updated screens

| Screen | Action |
|--------|--------|
| `app/(auth)/login.tsx` | Redesign: Email+Password form (primary) |
| `app/(auth)/signup.tsx` | **NEW** — Email, Password, Confirm Password |
| `app/(auth)/otp.tsx` | **COMMENT OUT** entire screen (preserve file) |
| `app/(auth)/_layout.tsx` | Add `signup` route; conditionally hide `otp` |

#### 1.2 Auth functions (`lib/auth.ts`)

```typescript
// ADD (new):
export async function signUpOwnerWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth();
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return { session: result.user };
}

// UNCOMMENT / USE (already exists):
export async function signInOwnerWithEmail(email: string, password: string) { ... }

// COMMENT OUT (preserve):
// export async function sendPhoneOtp(...) { ... }
// export async function verifyPhoneOtp(...) { ... }
```

#### 1.3 business-setup changes

- `owner_phone` ab manually input karo (email login mein `user.phoneNumber` empty hoga)
- Add phone field in create shop form (business contact, not auth)

```typescript
// BEFORE (broken with email auth):
const ownerPhone = user.phoneNumber || '';

// AFTER:
const ownerPhone = formOwnerPhone.trim(); // user enters in business-setup
```

#### 1.4 Login UI wireframe

```
┌─────────────────────────────────┐
│  OmniBill                       │
│  Login or Signup                │
│                                 │
│  [Owner]  [Staff]    ← tabs     │
│                                 │
│  Email                          │
│  ┌───────────────────────────┐  │
│  │ owner@shop.com            │  │
│  └───────────────────────────┘  │
│  Password                       │
│  ┌───────────────────────────┐  │
│  │ ••••••••                  │  │
│  └───────────────────────────┘  │
│                                 │
│  [ Login ]                      │
│                                 │
│  New shop? Sign Up →            │
│                                 │
│  /* PHONE OTP — COMMENTED OUT   │
│  Phone: +91 ________            │
│  [ Send OTP ]                   │
│  */                             │
└─────────────────────────────────┘
```

### Phase 2 — Staff PIN System (3–4 days)

#### 2.1 Database migration

New table: `staff_profiles` (see [Section 8](#8-database-changes))

#### 2.2 New screens

| Screen | Purpose |
|--------|---------|
| `app/(auth)/staff-pin.tsx` | Staff enters PIN to activate role |
| `app/settings/staff.tsx` (or section in settings) | Owner creates/edits staff + PIN |

#### 2.3 AuthContext extension

```typescript
type AuthSnapshot = {
  isReady: boolean;
  session: User | null;           // Owner's Firebase session
  hasBusiness: boolean;
  businessInfo: BusinessInfo | null;
  activeStaff: StaffProfile | null; // NEW — null = owner mode
};
```

#### 2.4 Staff PIN flow

```
Owner (Settings):
  → Add Staff: Name="Raju", Role="waiter", PIN="4521"
  → Server stores bcrypt hash of PIN in staff_profiles

Staff (Login screen → Staff tab):
  → Enter PIN: 4521
  → RPC: verify_staff_pin(p_business_id, p_pin) → returns staff profile
  → AuthContext.activeStaff = { id, name, role: 'waiter' }
  → Navigate to Tables (waiter) or Dashboard (staff)

Switch User (header/settings):
  → Clear activeStaff
  → Back to PIN screen (Firebase session stays alive)
```

#### 2.5 Audit trail

Har sale/order mein `created_by` field update karo:

```typescript
// Owner mode:
created_by: session.uid  // Firebase UID

// Staff mode:
created_by: `staff:${activeStaff.id}`  // e.g. "staff:uuid-abc"
```

### Phase 3 — Comment Out Phone Auth (1 day)

See [Section 10](#10-phone-auth-comment-out-strategy) for exact files.

### Phase 4 — Testing + Launch (2 days)

See [Section 12](#12-testing-plan) and [Section 13](#13-live-launch-checklist).

---

## 8. Database Changes

### Migration: `20260831300000_staff_profiles_and_pin_auth.sql`

```sql
-- Staff profiles with PIN (no Firebase account per staff)
CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role public.business_role NOT NULL DEFAULT 'staff',
  pin_hash text NOT NULL,          -- bcrypt hash, NEVER store plain PIN
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_name_not_blank CHECK (char_length(trim(display_name)) > 0),
  CONSTRAINT staff_profiles_role_check CHECK (role IN ('staff', 'waiter'))
);

CREATE INDEX idx_staff_profiles_business_id ON public.staff_profiles (business_id);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles FORCE ROW LEVEL SECURITY;

-- Only business owner can manage staff profiles
CREATE POLICY staff_profiles_select ON public.staff_profiles FOR SELECT TO anon, authenticated
  USING (public.user_belongs_to_business(business_id));

CREATE POLICY staff_profiles_insert ON public.staff_profiles FOR INSERT TO anon, authenticated
  WITH CHECK (public.user_is_business_owner(business_id));

CREATE POLICY staff_profiles_update ON public.staff_profiles FOR UPDATE TO anon, authenticated
  USING (public.user_is_business_owner(business_id));

CREATE POLICY staff_profiles_delete ON public.staff_profiles FOR DELETE TO anon, authenticated
  USING (public.user_is_business_owner(business_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_profiles TO anon, authenticated;

-- Verify staff PIN (called when staff logs in with PIN)
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
  p_business_id uuid,
  p_pin text
)
RETURNS TABLE (
  staff_id uuid,
  display_name text,
  role public.business_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Caller must be authenticated (owner's Firebase session on shared device)
  IF (auth.jwt() ->> 'sub') IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.user_belongs_to_business(p_business_id) THEN
    RAISE EXCEPTION 'Not a member of this business';
  END IF;

  RETURN QUERY
  SELECT sp.id, sp.display_name, sp.role
  FROM public.staff_profiles sp
  WHERE sp.business_id = p_business_id
    AND sp.is_active = true
    AND sp.pin_hash = crypt(p_pin, sp.pin_hash);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid PIN';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(uuid, text) TO anon, authenticated;

-- Create staff with PIN (owner only)
CREATE OR REPLACE FUNCTION public.create_staff_profile(
  p_business_id uuid,
  p_display_name text,
  p_role public.business_role,
  p_pin text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.user_is_business_owner(p_business_id) THEN
    RAISE EXCEPTION 'Only owner can create staff';
  END IF;

  IF length(p_pin) < 4 OR length(p_pin) > 6 OR p_pin !~ '^\d+$' THEN
    RAISE EXCEPTION 'PIN must be 4-6 digits';
  END IF;

  INSERT INTO public.staff_profiles (business_id, display_name, role, pin_hash)
  VALUES (p_business_id, trim(p_display_name), p_role, crypt(p_pin, gen_salt('bf')))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_staff_profile(uuid, text, public.business_role, text) TO anon, authenticated;
```

> **Note:** `pgcrypto` extension (`crypt`, `gen_salt`) Supabase mein default enabled hota hai.

### `businesses` table — no change required

`owner_phone` remains as business contact number (entered manually in business-setup).

### `business_users` — owner only via Firebase

Staff PIN users **do not** get a `business_users` row with separate Firebase UID.
Owner's Firebase UID handles RLS; staff context is app-level (`activeStaff`).

### `join_business_as_staff` RPC

**Phase 1:** Comment out / deprecate in UI (invite code flow replaced by owner-created PIN).
**Preserve:** RPC code in migrations for future re-enable.

---

## 9. File-by-File Change List

### New files

| File | Purpose |
|------|---------|
| `lib/authConfig.ts` | `AUTH_MODE` feature flag |
| `app/(auth)/signup.tsx` | Owner email signup |
| `app/(auth)/staff-pin.tsx` | Staff PIN entry |
| `lib/staffAuth.ts` | `verifyStaffPin`, `createStaffProfile` helpers |
| `supabase/migrations/20260831300000_staff_profiles_and_pin_auth.sql` | DB schema |
| `lib/staffAuth.test.ts` | PIN validation unit tests |

### Modified files

| File | Changes |
|------|---------|
| `app/(auth)/login.tsx` | Email+Password UI; phone OTP **commented out** |
| `app/(auth)/business-setup.tsx` | Manual `owner_phone` input; join flow optional |
| `app/(auth)/_layout.tsx` | Add signup, staff-pin routes |
| `lib/auth.ts` | Add `signUpOwnerWithEmail`; comment phone functions |
| `context/AuthContext.tsx` | Add `activeStaff`, `setActiveStaff`, `clearActiveStaff` |
| `app/settings.tsx` | Staff management section (add/edit PIN) |
| `app/_layout.tsx` | Waiter routing uses `activeStaff.role` |
| `app/(tabs)/_layout.tsx` | Tab visibility based on `activeStaff` |

### Commented out (NOT deleted)

| File | Action |
|------|--------|
| `app/(auth)/otp.tsx` | Wrap entire component in `/* PHONE_OTP_DISABLED ... */` |
| `components/FirebaseRecaptchaVerifierModal.tsx` | Keep file; imports commented in login.tsx |
| `lib/otpSession.ts` | Keep file; usage commented |
| `lib/auth.ts` → `sendPhoneOtp`, `verifyPhoneOtp` | Comment function bodies |

---

## 10. Phone Auth Comment-Out Strategy

### Rule: Code delete nahi, comment + flag

```typescript
// lib/authConfig.ts
/**
 * AUTH_MODE controls which login methods are active.
 *
 * 'email_pin'  → Production default. Email owner + Staff PIN. Zero SMS cost.
 * 'phone_otp'  → Legacy Firebase Phone OTP. Re-enable when cheap SMS provider integrated.
 *
 * To re-enable phone OTP:
 *   1. Set AUTH_MODE = 'phone_otp'
 *   2. Uncomment blocks marked PHONE_OTP_LEGACY below
 *   3. Enable Phone sign-in in Firebase Console
 */
export const AUTH_MODE = 'email_pin' as const;
```

### login.tsx pattern

```typescript
import { AUTH_MODE } from '@/lib/authConfig';

// ═══ ACTIVE: Email + Password ═══
if (AUTH_MODE === 'email_pin') {
  // ... email login form
}

// ═══ PHONE_OTP_LEGACY (commented for launch) ═══
// if (AUTH_MODE === 'phone_otp') {
//   const recaptchaRef = useRef<FirebaseRecaptchaVerifierModal>(null);
//   // ... original phone OTP UI
//   // await sendPhoneOtp(parsed.phone, verifier);
//   // router.push('/(auth)/otp');
// }
```

### otp.tsx pattern

```typescript
/**
 * PHONE_OTP_LEGACY — Entire screen disabled for launch.
 * Preserved for future cheap phone auth integration.
 * Re-enable: uncomment + set AUTH_MODE = 'phone_otp'
 */
/*
import ... (all original imports)

export default function OtpScreen() {
  // ... original implementation
}
*/

// Placeholder so Expo Router doesn't break if route exists:
import { Redirect } from 'expo-router';
export default function OtpScreen() {
  return <Redirect href="/(auth)/login" />;
}
```

### Firebase Console (live launch)

| Setting | Value |
|---------|-------|
| Email/Password | ✅ Enabled |
| Phone | ❌ Disabled |
| Test phone numbers | Keep for dev only |

---

## 11. Security Considerations

### Staff PIN security

| Concern | Mitigation |
|---------|------------|
| PIN brute force | Rate limit: 5 attempts → 5 min lockout (client + server) |
| PIN stored plain | **bcrypt hash** via `pgcrypto.crypt()` — never plain text |
| Shared device | Owner Firebase session + PIN layer = 2-factor at shop level |
| Staff fired | Owner deactivates staff (`is_active = false`) in Settings |
| PIN too simple | Reject `0000`, `1234`, sequential digits |

### Email/password security

| Concern | Mitigation |
|---------|------------|
| Weak password | Min 8 chars, 1 number required |
| Forgot password | Firebase `sendPasswordResetEmail()` — free, no SMS |
| Session hijack | Firebase handles token refresh; HTTPS only |

### RLS unchanged

Staff PIN does **not** bypass Supabase RLS.
- API calls still use owner's Firebase JWT
- `activeStaff` is app-level context for UI + audit `created_by`
- Waiter restrictions remain in `_layout.tsx` tab guards

---

## 12. Testing Plan

### Phase 1 tests (Owner email)

- [ ] Sign up with new email → business-setup → dashboard
- [ ] Login with existing email → dashboard (no business-setup)
- [ ] Wrong password → clear error message
- [ ] Duplicate email signup → Firebase "email already in use"
- [ ] Session persists after app kill (AsyncStorage)
- [ ] Sign out → back to login
- [ ] `owner_phone` saved correctly in business-setup (manual input)

### Phase 2 tests (Staff PIN)

- [ ] Owner creates staff with PIN in Settings
- [ ] Staff PIN login → correct role tabs visible
- [ ] Waiter PIN → only Tables tab (no Sales, no Inventory)
- [ ] Wrong PIN 5 times → lockout message
- [ ] Switch User → PIN screen, owner session alive
- [ ] Deactivated staff PIN → "Invalid PIN"
- [ ] Sale created by staff → `created_by` = `staff:{id}`

### Regression tests

- [ ] Retail checkout still works
- [ ] Restaurant KOT flow works
- [ ] Daybook totals correct
- [ ] Expense save works (migration 312500 applied)
- [ ] All existing Jest tests pass (`npm test`)

### Phone OTP legacy (commented — verify disabled)

- [ ] Login screen shows NO phone input when `AUTH_MODE = 'email_pin'`
- [ ] `/otp` route redirects to login
- [ ] No reCAPTCHA modal appears
- [ ] Firebase Console phone auth disabled → no SMS sent

---

## 13. Live Launch Checklist

### Pre-launch

- [ ] `AUTH_MODE = 'email_pin'` in `lib/authConfig.ts`
- [ ] Phone OTP code commented in all files (Section 10)
- [ ] Firebase Console: Email ✅, Phone ❌
- [ ] Migration `staff_profiles` applied in Supabase
- [ ] Migration `expenses_grants_and_rls` applied
- [ ] `npm test` — all pass
- [ ] `npx tsc --noEmit` — clean
- [ ] EAS build: `eas build --profile preview` for friend testing

### Post-launch monitoring

- [ ] Firebase billing → Authentication → confirm ₹0 SMS charges
- [ ] Supabase logs → no RLS errors on staff_profiles
- [ ] User feedback → PIN length, lockout timing

---

## 14. Future: Phone Auth Wapas Kaise Enable Karein

Jab business grow ho (1000+ shops) aur phone verification chahiye:

### Option A — Re-enable Firebase Phone OTP (quick)

```
1. AUTH_MODE = 'phone_otp'
2. Uncomment PHONE_OTP_LEGACY blocks
3. Firebase Console → Phone enabled
4. Cost: ~₹0.85/OTP
```

### Option B — Cheap Indian OTP provider (recommended at scale)

```
1. Sign up MSG91 / 2Factor / SpringEdge
2. DLT registration (TRAI mandatory for India SMS)
3. Supabase Edge Function:
   - send_otp(phone) → MSG91 API
   - verify_otp(phone, code) → check + issue Firebase custom token
4. Uncomment phone UI; swap sendPhoneOtp() implementation
5. Cost: ~₹0.15/OTP (5x cheaper than Firebase)
```

### Option C — Supabase Auth Phone (full migration)

```
1. Migrate from Firebase Auth → Supabase Auth
2. Use Supabase built-in phone OTP (Twilio backend)
3. Update all RLS (auth.jwt() structure changes)
4. Highest effort; only if leaving Firebase entirely
```

### Recommended timeline

| Stage | Shops | Auth Strategy |
|-------|-------|---------------|
| **Now (testing/launch)** | 0–100 | Email + PIN (₹0) |
| **Growth** | 100–1000 | Email + PIN; optional MSG91 for signup verify |
| **Scale** | 1000+ | MSG91/2Factor custom OTP for owner signup only |
| **Enterprise** | 10000+ | Own DLT entity + volume contract |

---

## 15. Cost Comparison Table

### Monthly cost at different scales (login OTPs only)

| Shops | Users | OTPs/month | Firebase | MSG91 | Email+PIN |
|-------|-------|------------|----------|-------|-----------|
| 10 | 30 | 1,800 | ₹1,530 | ₹360 | **₹0** |
| 100 | 300 | 18,000 | ₹15,300 | ₹3,600 | **₹0** |
| 500 | 1,500 | 90,000 | ₹76,500 | ₹18,000 | **₹0** |
| 1000 | 3,000 | 180,000 | ₹1,53,000 | ₹36,000 | **₹0** |

> Assumptions: 3 users/shop, 2 logins/day, 30 days. Firebase @ ₹0.85/SMS, MSG91 @ ₹0.20/SMS.

---

## Appendix A — Current Code References

```
app/(auth)/login.tsx          → Phone OTP entry (to be commented)
app/(auth)/otp.tsx            → OTP verification (to be commented)
lib/auth.ts                   → sendPhoneOtp, verifyPhoneOtp, signInOwnerWithEmail
lib/supabase.ts               → Firebase JWT → Supabase accessToken
context/AuthContext.tsx       → onAuthStateChanged listener
app/(auth)/business-setup.tsx → owner_phone from user.phoneNumber (needs fix)
app/settings.tsx              → Invite code generation (staff join)
supabase/.../staff_invites.sql → join_business_as_staff RPC
```

## Appendix B — Glossary

| Term | Meaning |
|------|---------|
| **MAU** | Monthly Active Users |
| **DLT** | Distributed Ledger Technology — TRAI mandate for commercial SMS in India |
| **RLS** | Row Level Security — Supabase per-row access control |
| **PIN** | 4–6 digit shop passcode for staff (not SMS OTP) |
| **PHASE_LEGACY** | Code blocks marked for phone OTP — comment, don't delete |

---

*Document created: Sep 2026*  
*Next action: Phase 0 → create `lib/authConfig.ts` + enable Email/Password in Firebase Console*
