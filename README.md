# Rhino Lake

## Description (DappRadar)
Rhino Lake is an onchain strategy game on Base where you mint a City NFT, lock BAR to grow city power, and lock $BANDA to build Army Power for battles. Cities level up through BAR thresholds, compete in battles, and share in ETH rewards based on their total locked weight (BAR + $BANDA). The app includes a Town hub, Army accrual, Marketplace swaps for BAR, and a Profile view to claim rewards and manage your PFP.

## How power works now
- Power is onchain and wallet-specific. It equals the amount of BAR locked in the Game contract for your city.
- City level is derived from BAR locked thresholds (1M, 10M, 20M, 40M, 80M, 120M, 200M, 400M, 700M, 1B, 10B BAR).
- Lock $BANDA to increase Army Power and enable attacks.

## How to test two wallets
1. Connect Wallet A, mint a city, and lock some BAR. Note the power/level.
2. Disconnect and connect Wallet B. If Wallet B has no city, you should see the Mint City CTA and power should be 0.
3. Mint a city for Wallet B and verify that Wallet A and Wallet B show independent power/level values.

## Profile Picture Shop (PFP)
1. Deploy the ProfilePicNFT contract with `node scripts/deploy-solc.mjs` after setting:
   - `BASE_PRIVATE_KEY`
   - `NEXT_PUBLIC_USDC_ADDRESS`
2. Set `NEXT_PUBLIC_PROFILE_PIC_NFT_ADDRESS` in `.env` to the deployed address.
3. Run the app and click the avatar to open the PFP shop, buy with USDC, and set active.
