# Merchant Desk: Monetization & Business Strategy

This document outlines the business and monetization strategy for the POS application.

### Rule 1: Ads Kabhi Mat Lagana
B2B (Billing) apps me ads dikhana sabse badi galti hoti hai. Counter par customer khada hota hai aur agar app me ad aa jaye toh dukandar ko gussa aata hai aur app sasti lagti hai. Isko strictly avoid karna.

### Phase 1 (Abhi ke liye - 0 to 50 Users)
- App 100% Free rakho. 
- AI features ke liye 10 credits free do. 
- Fir Pay-as-you-go kardo (jaise ₹99 me 100 credits). 
- Sarvam AI ki cost bahut kam (10 paise per API call) hai, toh is ₹99 me aapka profit margin ₹89 hoga!

### Phase 2 (Jab 50+ Users ho jayen)
- Tab aap "Subscription Model (SaaS)" launch karna (Basic vs Premium). 
- **Free plan (Basic):** User ko limit kardo (jaise max 500 bills/month aur no AI features).
- **Premium plan:** (₹399/month ya ₹3,999/saal) walo ko Unlimited Bills aur 300 AI Credits free do!

### Version Control & Branching Strategy
- **`phase-1` Branch:** Is branch mein hum Phase 1 ka naya kaam (AI Credits, Pay-as-you-go, aur Razorpay) implement karenge.
- **`main` Branch:** Ye branch hum testing aur bug fixes ke liye use karenge. Aage chalkar jab Phase 2 banayenge, toh uski updates bhi isme test hoti rahengi.
