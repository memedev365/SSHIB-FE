import { WalletAdapterNetwork, WalletError } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { FC, ReactNode, useCallback, useMemo, createContext, useContext, useState } from 'react';
import { AutoConnectProvider, useAutoConnect } from './AutoConnectProvider';
import { notify } from "../utils/notifications";
import { NetworkConfigurationProvider, useNetworkConfiguration } from './NetworkConfigurationProvider';
import dynamic from "next/dynamic";
import { clusterApiUrl } from '@solana/web3.js';
import {
    GlowWalletAdapter,
    PhantomWalletAdapter,
    SlopeWalletAdapter,
    SolflareWalletAdapter,
    TorusWalletAdapter,
} from "@solana/wallet-adapter-wallets";

interface EnhancedWalletError extends WalletError {
  isSendTransactionError: boolean;
}

type WalletErrorContextType = {
  walletError: EnhancedWalletError | null;
  setWalletError: (error: EnhancedWalletError | null) => void;
};

const WalletErrorContext = createContext<WalletErrorContextType>({
  walletError: null,
  setWalletError: () => {},
});

export const useWalletError = () => useContext(WalletErrorContext);

const ReactUIWalletModalProviderDynamic = dynamic(
    async () => (await import("@solana/wallet-adapter-react-ui")).WalletModalProvider,
    { ssr: false }
);

const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const { autoConnect } = useAutoConnect();
    const { networkConfiguration } = useNetworkConfiguration();
    const { setWalletError } = useWalletError();
    const network = networkConfiguration as WalletAdapterNetwork;

    const endpoint = useMemo(() => {
        const customEndpoint = process.env.NEXT_PUBLIC_RPC;
        return customEndpoint || clusterApiUrl(network);
    }, [network]);

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new GlowWalletAdapter(),
            new SlopeWalletAdapter(),
            new SolflareWalletAdapter({ network }),
            new TorusWalletAdapter()
        ],
        [network]
    );

    const onError = useCallback(
        (error: WalletError) => {
            const enhancedError: EnhancedWalletError = {
                ...error,
                isSendTransactionError: error.name.includes('WalletSendTransactionError') || 
                                      error.message.includes('transaction')
            };
            setWalletError(enhancedError);
            console.error('Wallet Error:', error);
          //  notify({ 
          //      type: 'error', 
                message: error.message ? `${error.name}: ${error.message}` : error.name 
          //  });
        },
        [setWalletError]
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} onError={onError} autoConnect={autoConnect}>
                <ReactUIWalletModalProviderDynamic>
                    {children}
                </ReactUIWalletModalProviderDynamic>
            </WalletProvider>
        </ConnectionProvider>
    );
};

export const ContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [walletError, setWalletError] = useState<EnhancedWalletError | null>(null);

    const handleSetWalletError = useCallback((error: WalletError | null) => {
        if (!error) {
            setWalletError(null);
            return;
        }
        const enhancedError: EnhancedWalletError = {
            ...error,
            isSendTransactionError: error.name.includes('WalletSendTransactionError') || 
                                error.message.includes('transaction')
        };
        setWalletError(enhancedError);
    }, []);

    return (
        <NetworkConfigurationProvider>
            <AutoConnectProvider>
                <WalletErrorContext.Provider 
                    value={{ 
                        walletError, 
                        setWalletError: handleSetWalletError 
                    }}
                >
                    <WalletContextProvider>{children}</WalletContextProvider>
                </WalletErrorContext.Provider>
            </AutoConnectProvider>
        </NetworkConfigurationProvider>
    );
};

export default ContextProvider;