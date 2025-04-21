// Next, React
import { FC, useEffect, useState } from 'react';
import Link from 'next/link';

// Wallet
import { useWallet, useConnection } from '@solana/wallet-adapter-react';

// Components
import { RequestAirdrop } from '../../components/RequestAirdrop';
import pkg from '../../../package.json';

// Store
import useUserSOLBalanceStore from '../../stores/useUserSOLBalanceStore';
import { Footer } from 'components/Footer';
import { TreeBubble } from 'components/treebubble';

export const HomeView: FC = ({ }) => {
  const wallet = useWallet();
  const { connection } = useConnection();

  const balance = useUserSOLBalanceStore((s) => s.balance)
  const { getUserSOLBalance } = useUserSOLBalanceStore()

  useEffect(() => {
    if (wallet.publicKey) {
      console.log(wallet.publicKey.toBase58())
      getUserSOLBalance(wallet.publicKey, connection)
    }
  }, [wallet.publicKey, connection, getUserSOLBalance])

  return (
    <div className="main-container font-quicksand">
      <h1 className="main-title">
        <span className="title-line">MINT YOUR SUPER SHIBA INU DOG TODAY</span>
        <span className="title-line">START WINNING!</span>
      </h1>

      <p className="subtitle">
        Don't wait—these rare NFTs won't last forever. Grab yours now, lock in your rewards, and let the good vibes roll!
      </p>

      <TreeBubble />
    </div>
  );
};
