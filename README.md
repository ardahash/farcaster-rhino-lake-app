# Rhino Lake

## How power works now
- Power is onchain and wallet-specific. It equals the amount of BAR locked in the Game contract for your city.
- City level is derived from BAR locked thresholds (1M, 10M, 20M, 40M, 80M, 120M, 200M, 400M, 700M, 1B, 10B BAR).
- Burn ZEN in the Temple to mint RHINO. Lock RHINO to increase war power and enable attacks.

## How to test two wallets
1. Connect Wallet A, mint a city, and lock some BAR. Note the power/level.
2. Disconnect and connect Wallet B. If Wallet B has no city, you should see the Mint City CTA and power should be 0.
3. Mint a city for Wallet B and verify that Wallet A and Wallet B show independent power/level values.
