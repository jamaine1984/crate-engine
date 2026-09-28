export const REVENUE_TYPES = Object.freeze(['rewarded_ads','interstitial_ads','premium_sales','dlc','iap','subscriptions','sponsorships','promotions','other']);
export function validateTerms(terms, type) {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) throw new Error('Revenue terms must be an object.');
  const result = {};
  for (const category of REVENUE_TYPES) {
    const creator = terms[category]?.creatorBps;
    const platform = terms[category]?.platformBps;
    if (!Number.isInteger(creator) || !Number.isInteger(platform) || creator < 0 || platform < 0 || creator + platform !== 10000) throw new Error(`Specify creator and platform basis points totalling 10000 for ${category}.`);
    if (type === 'platform_owned' && creator !== 0) throw new Error('Use a custom agreement for creator allocations.');
    result[category] = { creatorBps: creator, platformBps: platform };
  }
  return result;
}
export function allocateRevenue({grossMinor, feesMinor=0, creatorBps, currency}) {
  for (const n of [grossMinor,feesMinor]) if (!Number.isSafeInteger(n) || n<0) throw new Error('Amounts must be nonnegative integer minor units.');
  if (feesMinor>grossMinor || !Number.isInteger(creatorBps) || creatorBps<0 || creatorBps>10000 || !/^[A-Z]{3}$/.test(currency)) throw new Error('Invalid allocation input.');
  const eligibleMinor=grossMinor-feesMinor;
  const creatorMinor=Number(BigInt(eligibleMinor)*BigInt(creatorBps)/10000n);
  return {eligibleMinor,creatorMinor,platformMinor:eligibleMinor-creatorMinor,currency};
}
export function effectiveAgreement(versions,eventTime) {
  const matches=versions.filter(v=>v.effective_at<=eventTime && (v.end_at==null || eventTime<v.end_at));
  if(matches.length!==1) throw new Error('Exactly one agreement must apply at event time.');
  return matches[0];
}
export class DisabledPaymentProvider {
  async checkout(){throw Object.assign(new Error('Purchases are not yet enabled.'),{status:503,code:'PAYMENTS_DISABLED'});}
  async verifyPurchase(){throw Object.assign(new Error('No payment provider is active.'),{status:503,code:'PAYMENTS_DISABLED'});}
  async refund(){throw Object.assign(new Error('No payment provider is active.'),{status:503,code:'PAYMENTS_DISABLED'});}
}
export class DisabledAdProvider {
  async requestRewardedAd(){return {available:false,reason:'ADVERTISING_NOT_ENABLED',rewardGranted:false};}
  async requestInterstitial(){return {available:false,reason:'ADVERTISING_NOT_ENABLED'};}
}
