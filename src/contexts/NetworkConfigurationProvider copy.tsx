import { useLocalStorage } from '@solana/wallet-adapter-react';
import { createContext, FC, ReactNode, useContext } from 'react';


export interface NetworkConfigurationState {
    networkConfiguration: string;
    setNetworkConfiguration(networkConfiguration: string): void;
}

export const NetworkConfigurationContext = createContext<NetworkConfigurationState>({} as NetworkConfigurationState);

export function useNetworkConfiguration(): NetworkConfigurationState {
    return useContext(NetworkConfigurationContext);
}

export const NetworkConfigurationProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [networkConfiguration, setNetworkConfiguration] = useLocalStorage("network","https://empty-red-lake.solana-mainnet.quiknode.pro/316f08b779efa1c73cc2a1e954373750ea5af567/");

    return (
        <NetworkConfigurationContext.Provider value={{ networkConfiguration, setNetworkConfiguration }}>{children}</NetworkConfigurationContext.Provider>
    );
};