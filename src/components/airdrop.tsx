import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import axios from 'axios';

// You may need to adjust imports based on your project structure
import { notify } from '../utils/notifications';
import { ADMIN_WALLET_ADDRESS } from '../components/constance';

// Airdrop Component
const AirdropPanel: React.FC = () => {
    const wallet = useWallet();
    const [recipientWallet, setRecipientWallet] = useState('');
    const [nftId, setNftId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lastAirdropped, setLastAirdropped] = useState<any>(null);
    const [airdropHistory, setAirdropHistory] = useState<any[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [_ErrorMsg, setErrorMsg] = useState("");

    // Check if connected wallet is admin
    useEffect(() => {
        if (wallet.publicKey) {
            setIsAdmin(wallet.publicKey.toString() === ADMIN_WALLET_ADDRESS);
        } else {
            setIsAdmin(false);
        }
    }, [wallet.publicKey]);

    // Handle recipient input change
    const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setRecipientWallet(e.target.value);
    };

    // Handle NFT ID input change
    const handleNftIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Only allow numbers
        const value = e.target.value.replace(/[^0-9]/g, '');
        setNftId(value);
    };

    // Validate if a string is a valid Solana public key
    const isValidPublicKey = (address: string): boolean => {
        try {
            if (address) {
                new PublicKey(address);
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    };

    // Add to airdrop history
    const addToAirdropHistory = (airdropInfo: {
        id: string | number;
        recipient: string;
        timestamp: string;
        transactionId: string;
        imageUrl?: string;
        name?: string;
    }) => {
        setAirdropHistory(prevHistory => [airdropInfo, ...prevHistory]);
    };

    // Perform airdrop
    const airdropNFT = async () => {
        // Clear previous results
        setLastAirdropped(null);
        setIsLoading(true);

        try {
            console.log('[1/4] Starting airdrop process...');

            // 1. Validate wallet connection
            if (!wallet.publicKey || !wallet.signTransaction) {
                console.error('Admin wallet not connected!');
                notify({ type: 'error', message: 'Admin wallet not connected!' });
                setIsLoading(false);
                return;
            }

            // Check if user is admin
            if (!isAdmin) {
                console.error('Not authorized for airdrop');
                notify({ type: 'error', message: 'Only admin can perform airdrops!' });
                setIsLoading(false);
                return;
            }

            // 2. Validate recipient wallet
            if (!recipientWallet || !isValidPublicKey(recipientWallet)) {
                console.error('Invalid recipient wallet address');
                notify({ type: 'error', message: 'Invalid recipient wallet address!' });
                setIsLoading(false);
                return;
            }

            // 3. Validate NFT ID
            const nftIdNumber = parseInt(nftId, 10);
            if (isNaN(nftIdNumber) || nftIdNumber < 0 || nftIdNumber >= 10000) {
                console.error('Invalid NFT ID');
                notify({ type: 'error', message: 'NFT ID must be between 0 and 9999!' });
                setIsLoading(false);
                return;
            }

            // 4. Call backend API to airdrop NFT
            console.log('[2/4] Calling backend airdrop API...');
            //debouncedSetNotification({ message: 'Processing airdrop...', type: 'info' });

            // Create payload object
            const payload = {
                userWallet: recipientWallet,
                nftId: nftIdNumber
            };

            // Using axios with admin authorization
            const response = await axios.post('http://localhost:3001/api/airdrop', payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${wallet.publicKey.toString()}`
                }
            });

            // Access data directly from axios response
            const _response = response.data;
            const nftAssetId = _response.nftId;
            const imageUrl = _response.imageUrl;
            const name = _response.name;

            console.log("_response : " + JSON.stringify(_response));

            console.log(`Airdropped NFT: ${name} (${nftAssetId}) to ${recipientWallet}`);
            /*debouncedSetNotification({
              message: `Airdropped ${name} to ${recipientWallet.slice(0, 6)}...${recipientWallet.slice(-4)}`,
              type: 'success'
            });*/

            await new Promise(resolve => setTimeout(resolve, 2000));

            const mintTxid = _response.details.airdropDetails.transactionId;

            // Update UI with airdropped NFT
            console.log('[3/4] Updating UI...');
            setLastAirdropped({ id: nftAssetId, imageUrl, name });

            // Add to airdrop history
            console.log('[4/4] Adding to airdrop history...');
            addToAirdropHistory({
                id: nftIdNumber,
                recipient: recipientWallet,
                timestamp: new Date().toISOString(),
                transactionId: mintTxid,
                imageUrl,
                name
            });

            // Reset form
            setNftId('');

            console.log('Airdrop process completed successfully');

        } catch (error: any) {
            console.error('Airdrop error:', error);

            // For axios errors, access the structured error details
            if (error.response?.data?.error) {
                const errorCode = error.response.data.error.code;
                const errorMessage = error.response.data.error.message;

                console.error(`Error ${errorCode}: ${errorMessage}`);
                setErrorMsg(errorMessage);
                /*debouncedSetNotification({
                  message: `Airdrop Failed: ${errorMessage}`,
                  type: 'error'
                });*/
            } else {
                // Generic error handling
                const errorMessage = error.message || 'Airdrop failed';
                /* debouncedSetNotification({
                   message: `Airdrop Failed: ${errorMessage}`,
                   type: 'error'
                 });*/
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (_ErrorMsg) {
            const timer = setTimeout(() => {
                setErrorMsg(''); // Clear the error message after 3 seconds
            }, 3000);

            return () => clearTimeout(timer); // Cleanup to avoid memory leaks
        }
    }, [_ErrorMsg]); // Run effect whenever _ErrorMsg changes


    return (
        <div className="airdrop-panel">
            {isAdmin ?
                <h2 className="text-2xl font-bold mb-4 mt-10 text-black">Admin Airdrop</h2> :
                null}

            {!wallet.connected ? (
                <div className="connect-wallet-container text-center py-6">
                    {/* <p className="mb-4 text-black" >Connect your admin wallet to perform airdrops</p>
          <WalletMultiButton />*/}
                </div>
            ) : !isAdmin ? (
                <div>
                    {/*<p>Connected wallet is not authorized for airdrops.</p>
          <p className="text-sm mt-2">Please connect the admin wallet.</p>*/}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 mb-6">
                        <div>
                            <label htmlFor="recipient-wallet" className="block text-sm font-medium mb-1 text-black">
                                Recipient Wallet Address
                            </label>
                            <input
                                id="recipient-wallet"
                                type="text"
                                value={recipientWallet}
                                onChange={handleRecipientChange}
                                placeholder="Enter recipient wallet address"
                                className={`w-full text-black p-3 border rounded-md ${recipientWallet && !isValidPublicKey(recipientWallet)
                                    ? 'border-red-500'
                                    : 'border-gray-300'
                                    }`}
                            />
                            {recipientWallet && !isValidPublicKey(recipientWallet) && (
                                <p className="text-red-500 text-sm mt-1">Invalid wallet address</p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="nft-id" className="block text-sm font-medium mb-1 text-black">
                                NFT ID (0-9999)
                            </label>
                            <input
                                id="nft-id"
                                type="text"
                                value={nftId}
                                onChange={handleNftIdChange}
                                placeholder="Enter NFT ID"
                                className="w-full p-3 border border-gray-300 rounded-md text-black"
                            />
                        </div>
                    </div>

                    <button
                        onClick={airdropNFT}
                        disabled={isLoading || !isValidPublicKey(recipientWallet) || !nftId}
                        className={`w-full py-3 rounded-md font-medium transition ${isLoading || !isValidPublicKey(recipientWallet) || !nftId
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                    >
                        {isLoading ? 'Processing...' : 'Airdrop NFT'}

                    </button>


                    {_ErrorMsg && (
                        <div className="font-semibold mt-2 text-red-500">{_ErrorMsg}</div>
                    )}

                    {lastAirdropped && (
                        <div className="mt-8">
                            <h3 className="text-lg font-semibold mb-2 text-black">Last Airdropped NFT</h3>
                            <div className="bg-gray-100 p-4 rounded-md flex items-center">
                                <div className="w-16 h-16 mr-4">
                                    <img
                                        src={lastAirdropped.imageUrl}
                                        alt={lastAirdropped.name}
                                        className="w-full h-full object-contain rounded-md"
                                    />
                                </div>
                                <div>
                                    <p className="font-medium text-black">{lastAirdropped.name}</p>
                                    <p className="text-sm text-gray-600">Asset ID: {lastAirdropped.id}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {airdropHistory.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-lg font-semibold mb-2 text-black">Airdrop You Just Did</h3>
                            <div className="bg-white border rounded-md overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NFT</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {airdropHistory.map((item, index) => (
                                            <tr key={index}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        {item.imageUrl && (
                                                            <div className="flex-shrink-0 h-8 w-8 mr-2">
                                                                <img className="h-8 w-8 rounded-md" src={item.imageUrl} alt="" />
                                                            </div>
                                                        )}
                                                        <span className='text-black'>{item.name || `NFT #${item.id}`}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {item.id}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {`${item.recipient.slice(0, 6)}...${item.recipient.slice(-4)}`}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {new Date(item.timestamp).toLocaleTimeString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AirdropPanel;
