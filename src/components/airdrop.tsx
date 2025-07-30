import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import axios from 'axios';

// You may need to adjust imports based on your project structure
import { notify } from '../utils/notifications';
import { ADMIN_WALLET_ADDRESS } from '../components/constance';

// Types for tracking individual airdrop status
interface AirdropItem {
    recipient: string;
    nftId: number;
    status: 'pending' | 'processing' | 'success' | 'error';
    error?: string;
    transactionId?: string;
    imageUrl?: string;
    name?: string;
    assetId?: string;
}

// SSHIB Airdrop Component
const AirdropPanel: React.FC = () => {
    const wallet = useWallet();
    const [recipientWallets, setRecipientWallets] = useState('');
    const [nftIds, setNftIds] = useState('');
    const [parsedRecipients, setParsedRecipients] = useState<string[]>([]);
    const [parsedNftIds, setParsedNftIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lastAirdropped, setLastAirdropped] = useState<any>(null);
    const [airdropHistory, setAirdropHistory] = useState<any[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [_ErrorMsg, setErrorMsg] = useState("");

    // New state for tracking individual airdrops
    const [airdropQueue, setAirdropQueue] = useState<AirdropItem[]>([]);
    const [currentProcessing, setCurrentProcessing] = useState<number>(-1);
    const [showProcessingPanel, setShowProcessingPanel] = useState(false);

    // Check if connected wallet is admin
    useEffect(() => {
        if (wallet.publicKey) {
            setIsAdmin(wallet.publicKey.toString() === ADMIN_WALLET_ADDRESS);
        } else {
            setIsAdmin(false);
        }
    }, [wallet.publicKey]);

    // Handle bulk recipient input change
    const handleRecipientChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setRecipientWallets(value);

        // Parse addresses (split by newlines, commas, or spaces)
        const addresses = value
            .split(/[\n,\s]+/)
            .map(addr => addr.trim())
            .filter(addr => addr.length > 0);
        setParsedRecipients(addresses);
    };

    // Handle bulk NFT ID input change
    const handleNftIdChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setNftIds(value);

        // Parse NFT IDs (split by newlines, commas, or spaces)
        const ids = value
            .split(/[\n,\s]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0)
            .map(id => parseInt(id, 10))
            .filter(id => !isNaN(id));
        setParsedNftIds(ids);
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

    // Update airdrop item status
    const updateAirdropStatus = (index: number, updates: Partial<AirdropItem>) => {
        setAirdropQueue(prevQueue =>
            prevQueue.map((item, i) =>
                i === index ? { ...item, ...updates } : item
            )
        );
    };

    // Perform bulk airdrop with individual tracking
    const airdropNFT = async () => {
        // Clear previous results
        setLastAirdropped(null);
        setIsLoading(true);
        setErrorMsg("");
        setShowProcessingPanel(true);

        try {
            console.log('[1/4] Starting SSHIB bulk airdrop process...');

            // 1. Validate wallet connection
            if (!wallet.publicKey || !wallet.signTransaction) {
                console.error('Admin wallet not connected!');
                notify({ type: 'error', message: 'Admin wallet not connected!' });
                setIsLoading(false);
                setShowProcessingPanel(false);
                return;
            }

            // Check if user is admin
            if (!isAdmin) {
                console.error('Not authorized for airdrop');
                notify({ type: 'error', message: 'Only admin can perform airdrops!' });
                setIsLoading(false);
                setShowProcessingPanel(false);
                return;
            }

            // 2. Validate recipient wallets
            if (parsedRecipients.length === 0) {
                console.error('No recipient wallet addresses provided');
                notify({ type: 'error', message: 'Please provide at least one recipient wallet address!' });
                setIsLoading(false);
                setShowProcessingPanel(false);
                return;
            }

            // Validate all addresses
            const invalidAddresses = parsedRecipients.filter(addr => !isValidPublicKey(addr));
            if (invalidAddresses.length > 0) {
                console.error('Invalid recipient wallet addresses found');
                notify({ type: 'error', message: `Invalid wallet addresses: ${invalidAddresses.slice(0, 3).join(', ')}${invalidAddresses.length > 3 ? '...' : ''}` });
                setIsLoading(false);
                setShowProcessingPanel(false);
                return;
            }

            // 3. Validate NFT IDs
            if (parsedNftIds.length === 0) {
                console.error('No NFT IDs provided');
                notify({ type: 'error', message: 'Please provide at least one NFT ID!' });
                setIsLoading(false);
                setShowProcessingPanel(false);
                return;
            }

            // Check if arrays match in length (for 1:1 mapping) or if we have single NFT ID for all recipients
            if (parsedNftIds.length !== 1 && parsedNftIds.length !== parsedRecipients.length) {
                console.error('Mismatch between recipients and NFT IDs');
                notify({ type: 'error', message: 'Provide either one NFT ID for all recipients, or one NFT ID per recipient!' });
                setIsLoading(false);
                setShowProcessingPanel(false);
                return;
            }

            // Validate NFT ID ranges
            const invalidIds = parsedNftIds.filter(id => id < 0 || id >= 10000);
            if (invalidIds.length > 0) {
                console.error('Invalid NFT IDs');
                notify({ type: 'error', message: `NFT IDs must be between 0 and 9999. Invalid IDs: ${invalidIds.slice(0, 5).join(', ')}` });
                setIsLoading(false);
                setShowProcessingPanel(false);
                return;
            }

            // 4. Initialize airdrop queue
            const initialQueue: AirdropItem[] = parsedRecipients.map((recipient, i) => ({
                recipient,
                nftId: parsedNftIds.length === 1 ? parsedNftIds[0] : parsedNftIds[i],
                status: 'pending'
            }));
            setAirdropQueue(initialQueue);

            // 5. Process each airdrop individually
            console.log(`[2/4] Processing ${parsedRecipients.length} SSHIB airdrops...`);
            let successCount = 0;
            let failureCount = 0;

            for (let i = 0; i < initialQueue.length; i++) {
                const item = initialQueue[i];
                setCurrentProcessing(i);

                // Update status to processing
                updateAirdropStatus(i, { status: 'processing' });

                try {
                    const payload = {
                        userWallet: item.recipient,
                        nftId: item.nftId
                    };

                    const response = await axios.post('https://sshib-be.onrender.com/api/airdrop', payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'Authorization': `Bearer ${wallet.publicKey.toString()}`
                        }
                    });

                    const _response = response.data;
                    const nftAssetId = _response.nftId;
                    const imageUrl = _response.imageUrl;
                    const name = _response.name;
                    const mintTxid = _response.details.airdropDetails.transactionId;

                    // Update status to success
                    updateAirdropStatus(i, {
                        status: 'success',
                        transactionId: mintTxid,
                        imageUrl,
                        name,
                        assetId: nftAssetId
                    });

                    // Add to airdrop history
                    addToAirdropHistory({
                        id: item.nftId,
                        recipient: item.recipient,
                        timestamp: new Date().toISOString(),
                        transactionId: mintTxid,
                        imageUrl,
                        name
                    });

                    // Update last airdropped
                    setLastAirdropped({
                        id: nftAssetId,
                        imageUrl,
                        name
                    });

                    successCount++;
                    console.log(`✅ Airdropped SSHIB NFT: ${name} (${nftAssetId}) to ${item.recipient}`);

                    // Show individual success notification
                    notify({
                        type: 'success',
                        message: `✅ Airdropped ${name} to ${item.recipient.slice(0, 6)}...${item.recipient.slice(-4)}`
                    });

                } catch (error: any) {
                    console.error(`❌ SSHIB Airdrop failed for ${item.recipient}:`, error);

                    // Extract detailed error information
                    let errorMessage = 'Unknown error';
                    let errorCode = 'UNKNOWN';

                    if (error.response?.data?.error) {
                        errorMessage = error.response.data.error.message || error.message;
                        errorCode = error.response.data.error.code || 'SERVER_ERROR';
                    } else if (error.response?.data) {
                        errorMessage = error.response.data.message || error.message;
                    } else {
                        errorMessage = error.message || 'Network error';
                    }

                    console.error(`Error details for ${item.recipient}:`, {
                        code: errorCode,
                        message: errorMessage,
                        status: error.response?.status,
                        data: error.response?.data
                    });

                    // Update status to error
                    updateAirdropStatus(i, {
                        status: 'error',
                        error: `${errorCode}: ${errorMessage}`
                    });

                    failureCount++;

                    // Show individual error notification
                    notify({
                        type: 'error',
                        message: `❌ Failed to airdrop to ${item.recipient.slice(0, 6)}...${item.recipient.slice(-4)}: ${errorMessage}`
                    });
                }

                // Small delay between requests to avoid overwhelming the server
                if (i < initialQueue.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            setCurrentProcessing(-1);
            console.log('[3/4] Updating UI...');

            // Show final summary notification
            if (successCount > 0) {
                notify({
                    type: 'success',
                    message: `🎉 SSHIB bulk airdrop completed! ${successCount} successful${failureCount > 0 ? `, ${failureCount} failed` : ''}`
                });
            }

            if (failureCount > 0 && successCount === 0) {
                notify({
                    type: 'error',
                    message: `❌ All SSHIB airdrops failed (${failureCount} total)`
                });
            }

            // Reset form on success
            if (successCount > 0) {
                setNftIds('');
                setRecipientWallets('');
                setParsedRecipients([]);
                setParsedNftIds([]);
            }

            console.log(`[4/4] SSHIB bulk airdrop completed. Success: ${successCount}, Failed: ${failureCount}`);

        } catch (error: any) {
            console.error('SSHIB bulk airdrop error:', error);
            setCurrentProcessing(-1);

            // For axios errors, access the structured error details
            if (error.response?.data?.error) {
                const errorCode = error.response.data.error.code;
                const errorMessage = error.response.data.error.message;

                console.error(`Error ${errorCode}: ${errorMessage}`);
                setErrorMsg(errorMessage);
                notify({
                    type: 'error',
                    message: `SSHIB Bulk Airdrop Failed: ${errorMessage}`
                });
            } else {
                // Generic error handling
                const errorMessage = error.message || 'SSHIB bulk airdrop failed';
                setErrorMsg(errorMessage);
                notify({
                    type: 'error',
                    message: `SSHIB Bulk Airdrop Failed: ${errorMessage}`
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Close processing panel
    const closeProcessingPanel = () => {
        setShowProcessingPanel(false);
        setAirdropQueue([]);
        setCurrentProcessing(-1);
    };

    useEffect(() => {
        if (_ErrorMsg) {
            const timer = setTimeout(() => {
                setErrorMsg(''); // Clear the error message after 5 seconds
            }, 5000);

            return () => clearTimeout(timer); // Cleanup to avoid memory leaks
        }
    }, [_ErrorMsg]); // Run effect whenever _ErrorMsg changes

    // Helper function to check if form is valid
    const isFormValid = () => {
        return parsedRecipients.length > 0 &&
            parsedNftIds.length > 0 &&
            parsedRecipients.every(addr => isValidPublicKey(addr)) &&
            parsedNftIds.every(id => id >= 0 && id < 10000) &&
            (parsedNftIds.length === 1 || parsedNftIds.length === parsedRecipients.length);
    };

    // Get status icon
    const getStatusIcon = (status: AirdropItem['status']) => {
        switch (status) {
            case 'pending':
                return '⏳';
            case 'processing':
                return '🔄';
            case 'success':
                return '✅';
            case 'error':
                return '❌';
            default:
                return '⏳';
        }
    };

    // Get status color
    const getStatusColor = (status: AirdropItem['status']) => {
        switch (status) {
            case 'pending':
                return 'text-gray-500';
            case 'processing':
                return 'text-blue-500';
            case 'success':
                return 'text-green-500';
            case 'error':
                return 'text-red-500';
            default:
                return 'text-gray-500';
        }
    };

    return (
        <div className="airdrop-panel">
            {isAdmin && (
                <h2 className="text-2xl font-bold mb-4 mt-10 text-black">SSHIB Admin Bulk Airdrop</h2>
            )}

            {!wallet.connected ? (
                <div className="connect-wallet-container text-center py-6">
                   
                </div>
            ) : !isAdmin ? (
                <div className="text-center py-6">
                     
                </div>
            ) : (
                <>

                    {/* Processing Panel */}
                    {showProcessingPanel && airdropQueue.length > 0 && (
                        <div className="mt-6 bg-white border border-gray-300 rounded-lg p-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-black">
                                    SSHIB Airdrop Progress ({airdropQueue.filter(item => item.status === 'success').length}/{airdropQueue.length} completed)
                                </h3>
                                {!isLoading && (
                                    <button
                                        onClick={closeProcessingPanel}
                                        className="text-gray-500 hover:text-gray-700"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2 max-h-96 overflow-y-auto">
                                {airdropQueue.map((item, index) => (
                                    <div
                                        key={index}
                                        className={`flex items-center justify-between p-3 rounded-md border ${currentProcessing === index ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                                            }`}
                                    >
                                        <div className="flex items-center space-x-3">
                                            <span className="text-lg">{getStatusIcon(item.status)}</span>
                                            <div>
                                                <p className="text-sm font-medium text-black">
                                                    SSHIB #{item.nftId} → {item.recipient.slice(0, 6)}...{item.recipient.slice(-4)}
                                                </p>
                                                {item.error && (
                                                    <p className="text-xs text-red-500 mt-1">{item.error}</p>
                                                )}
                                                {item.name && (
                                                    <p className="text-xs text-green-600 mt-1">{item.name}</p>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`text-sm font-medium ${getStatusColor(item.status)}`}>
                                            {item.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {_ErrorMsg && (
                        <div className="font-semibold mt-2 p-3 bg-red-100 border border-red-300 rounded-md text-red-700">
                            {_ErrorMsg}
                        </div>
                    )}

                    {lastAirdropped && (
                        <div className="mt-8">
                            <h3 className="text-lg font-semibold mb-2 text-black">Last Airdropped SSHIB NFT</h3>
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

                    <div className="grid grid-cols-1 gap-4 mb-6">
                        <div>
                            <label htmlFor="recipient-wallets" className="block text-sm font-medium mb-1 text-black">
                                Recipient Wallet Addresses ({parsedRecipients.length} addresses)
                            </label>
                            <textarea
                                id="recipient-wallets"
                                value={recipientWallets}
                                onChange={handleRecipientChange}
                                placeholder="Enter wallet addresses (one per line, or separated by commas/spaces)&#10;Example:&#10;7xKXt...abc123&#10;8yLMu...def456"
                                rows={5}
                                className="w-full text-black p-3 border border-gray-300 rounded-md resize-vertical"
                                disabled={isLoading}
                            />
                            {parsedRecipients.length > 0 && (
                                <p className="text-sm text-gray-600 mt-1">
                                    Valid addresses: {parsedRecipients.filter(addr => isValidPublicKey(addr)).length} / {parsedRecipients.length}
                                </p>
                            )}
                            {parsedRecipients.length > 0 && parsedRecipients.some(addr => !isValidPublicKey(addr)) && (
                                <p className="text-red-500 text-sm mt-1">
                                    Some wallet addresses are invalid
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="nft-ids" className="block text-sm font-medium mb-1 text-black">
                                SSHIB NFT IDs (0-9999) - ({parsedNftIds.length} IDs)
                            </label>
                            <textarea
                                id="nft-ids"
                                value={nftIds}
                                onChange={handleNftIdChange}
                                placeholder="Enter SSHIB NFT IDs (one per line, or separated by commas/spaces)&#10;Use one ID for all recipients, or one ID per recipient&#10;Example: 1234 or 1234,5678,9999"
                                rows={3}
                                className="w-full p-3 border border-gray-300 rounded-md text-black resize-vertical"
                                disabled={isLoading}
                            />
                            {parsedNftIds.length > 0 && (
                                <p className="text-sm text-gray-600 mt-1">
                                    Valid IDs: {parsedNftIds.filter(id => id >= 0 && id < 10000).length} / {parsedNftIds.length}
                                </p>
                            )}
                            {parsedNftIds.length > 0 && parsedNftIds.some(id => id < 0 || id >= 10000) && (
                                <p className="text-red-500 text-sm mt-1">
                                    Some NFT IDs are out of range (must be 0-9999)
                                </p>
                            )}
                            {parsedRecipients.length > 0 && parsedNftIds.length > 1 && parsedNftIds.length !== parsedRecipients.length && (
                                <p className="text-red-500 text-sm mt-1">
                                    Number of NFT IDs must match number of recipients, or provide just one NFT ID for all
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        onClick={airdropNFT}
                        disabled={isLoading || !isFormValid()}
                        className={`w-full py-3 rounded-md font-medium transition ${isLoading || !isFormValid()
                            ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            }`}
                    >
                        {isLoading
                            ? `Processing SSHIB Airdrops... (${parsedRecipients.length} airdrops)`
                            : `Airdrop ${parsedRecipients.length > 0 ? parsedRecipients.length : ''} SSHIB NFT${parsedRecipients.length !== 1 ? 's' : ''}`
                        }
                    </button>

                </>
            )}
        </div>
    );
};

export default AirdropPanel;
