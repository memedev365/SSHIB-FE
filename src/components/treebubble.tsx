import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
    Transaction,
    SystemProgram,
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL,
    PublicKey,
    Connection,
    Keypair
} from '@solana/web3.js';
import { FC, useMemo, useState, useEffect } from 'react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { transactionBuilder, publicKey, keypairIdentity } from '@metaplex-foundation/umi';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import {
    mplBubblegum, fetchMerkleTree,
    findLeafAssetIdPda, mintToCollectionV1, parseLeafFromMintToCollectionV1Transaction
} from '@metaplex-foundation/mpl-bubblegum';
import { publicKey as UMIPublicKey } from "@metaplex-foundation/umi";
import { useWalletError } from '../contexts/ContextProvider';
import dynamic from 'next/dynamic';
import { debounce } from 'lodash';
import { notify } from "../utils/notifications";
import axios from 'axios'; // Add axios import
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import AirdropPanel from './airdrop';

const WalletMultiButtonDynamic = dynamic(
    async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
    { ssr: false }
);

export const TreeBubble: FC = () => {
    // Wallet and connection
    const { connection } = useConnection();
    const wallet = useWallet();
    const { walletError, setWalletError } = useWalletError();

    // Configuration
    const quicknodeEndpoint = process.env.NEXT_PUBLIC_HELIUS_RPC;
    const merkleTreeLink = UMIPublicKey(process.env.NEXT_PUBLIC_MERKLETREE);
    const tokenAddress = UMIPublicKey(process.env.NEXT_PUBLIC_TOKEN_ADDRESS_OF_THE_COLLECTION);
    const [_lastMintedNftId, setLastMintedNftId] = useState('');
    const [_response, set_response] = useState('');
    const [_response2, set_response2] = useState('');
    const [_response3, setResponse3] = useState('');

    const [disableCreateMerkle, setDisableCreateMerkle] = useState(false);
    const [disableCreateCollection, setDisableCreateCollection] = useState(false);
    const [disableMintToCollection, setDisableMintToCollection] = useState(false);

    const [disableVerify, setDisableVerify] = useState(false);
    const [errorVerify, setErrorVerify] = useState('');
    const [_responseVerify, set_responseVerify] = useState('');
    
    const perNFTPrice = process.env.NEXT_PUBLIC_PER_NFT_PRICE;
    const adminWalletAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET;

    console.log("perNFTPrice : " + perNFTPrice);
    console.log("adminWalletAddress : " + adminWalletAddress);

    // State
    const [lastMintedNft, setLastMintedNft] = useState<{
        id: string;
        imageUrl: string;
        name: string;
    } | null>(null);

    const [totalMinted, setTotalMinted] = useState(0);
    const MAX_SUPPLY = 10000;

    const [notification, setNotification] = useState<{
        message: string;
        type: 'success' | 'error' | 'info';
    } | null>(null);

    const [copyAlert, setCopyAlert] = useState(false);

    // UMI instance
    const umi = useMemo(() => {
        const umiInstance = createUmi(quicknodeEndpoint)
            .use(mplTokenMetadata())
            .use(mplBubblegum());

        // Only add wallet identity if wallet is connected
        if (wallet.publicKey && wallet.signTransaction) {
            umiInstance.use(walletAdapterIdentity(wallet));
        }

        return umiInstance;
    }, [quicknodeEndpoint, wallet.publicKey, wallet.signTransaction]);

    // Debounced notification to prevent flickering
    const debouncedSetNotification = useMemo(() =>
        debounce(setNotification, 300), []
    );

    // Error handling
    useEffect(() => {
        if (!walletError) return;

        console.error('Wallet Error:', walletError);

        if (!isUserRejection(walletError)) {
            debouncedSetNotification({
                message: walletError.isSendTransactionError
                    ? 'Transaction failed. Please try again.'
                    : walletError.message || 'Wallet error occurred',
                type: 'error'
            });
        }

        const timer = setTimeout(() => setWalletError(null), 3000);
        return () => clearTimeout(timer);
    }, [walletError, setWalletError, debouncedSetNotification]);

    // Fetch mint count
    async function fetchMintCount() {
        try {
            const treeAccount = await fetchMerkleTree(umi, merkleTreeLink);
            setTotalMinted(Number(treeAccount.tree.sequenceNumber));
        } catch (error) {
            console.error("Error fetching mint count:", error);
        }
    }

    useEffect(() => {
        fetchMintCount();
    }, [umi, merkleTreeLink]);

    // Minting function
    async function mintWithSolPayment() {
    // Clear previous minted NFT
    setLastMintedNft(null);
    let loaderNotificationId: string | undefined;

    try {
        console.log('[1/6] Starting mint process...');

        // 1. Validate wallet connection
        if (!wallet.publicKey || !wallet.signTransaction) {
            console.error('Wallet not connected!');
            notify({ type: 'error', message: 'Wallet not connected!' });
            return;
        }

        // 2. Check mint limits
        console.log('[2/6] Checking mint limits...');
        if (totalMinted >= Number(MAX_SUPPLY)) {
            console.error('Max supply reached');
            notify({ type: 'error', message: 'All NFTs minted!' });
            return;
        }

        // 3. Check existing mints by this wallet
        console.log('[3/6] Checking existing mints...');
        const assets = await umi.rpc.getAssetsByOwner({
            owner: publicKey(wallet.publicKey.toString()),
            sortBy: { sortBy: 'created', sortDirection: 'desc' },
        });

        const mintedCount = assets.items.filter(asset =>
            asset.compression.compressed &&
            asset.compression.tree === merkleTreeLink.toString() &&
            asset.grouping.some(g => g.group_value === tokenAddress.toString())
        ).length;

        console.log(`User has minted ${mintedCount}/10 NFTs`);
        if (mintedCount >= 10) {  // Changed from 10000 to 10 based on your comment about 10 NFTs per wallet
            console.error('Mint limit reached for wallet');
            notify({ type: 'error', message: 'You can only mint 10 NFTs per wallet!' });
            return;
        }

        // 4. Process payment
        console.log('[4/6] Processing payment...');
        debouncedSetNotification({ message: 'Processing payment...', type: 'info' });

        const adminWallet = new PublicKey(adminWalletAddress);
        const transferInstruction = SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: adminWallet,
            lamports: LAMPORTS_PER_SOL * Number(perNFTPrice)
        });

        const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 100000
        });

        // Create transaction
        let transaction = new Transaction()
            .add(priorityFeeInstruction)
            .add(transferInstruction);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;

        // Separate signing from sending
        console.log('Signing transaction...');
        const signedTransaction = await wallet.signTransaction(transaction);

        console.log('Sending signed transaction...');
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());

        const txid = signature.toString();
        console.log(`Payment TXID: ${txid}`);

        debouncedSetNotification({ message: 'Processing payment...', type: 'info' });

        // Wait for payment confirmation
        console.log('Waiting for payment confirmation...');
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('Payment confirmed on-chain');

        // 5. Call backend API to mint NFT
        console.log('[5/6] Calling backend mint API...');
        debouncedSetNotification({ message: 'Minting NFT...', type: 'info' });

        // Prepare the payload as expected by the backend
        const payload = {
            userWallet: wallet.publicKey.toString(),
            paymentSignature: signature
        };

        // Verify the backend URL is correct - adjust if needed
        const apiUrl = 'https://sshib-be.onrender.com/api/mint';
        console.log(`Calling API: ${apiUrl} with payload:`, payload);

        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
        });

        // Check if response has the expected structure
        const responseData = response.data;
        console.log("Response data:", responseData);

        if (!responseData.success) {
            throw new Error(responseData.error || 'Mint failed with unknown error');
        }

        const nftId = responseData.nftId;
        const imageUrl = responseData.imageUrl;
        const name = responseData.name;
        const mintTxid = responseData.details.paymentVerification.transactionId;

        console.log(`Minted NFT: ${name} (${nftId})`);
        debouncedSetNotification({ message: `Minted ${name}!`, type: 'success' });

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Update UI with minted NFT
        console.log('[6/6] Updating UI...');
        setLastMintedNft({ id: nftId, imageUrl, name });
        setLastMintedNftId(nftId);
        await fetchMintCount(); // Refresh mint count

        console.log('Mint process completed successfully');

    } catch (error: any) {
        console.error('Minting error:', error);

        if (error.message?.includes('User rejected') || error.message?.includes('rejected')) {
            console.log('User rejected transaction');
            debouncedSetNotification({ message: 'Transaction rejected by user', type: 'info' });
            return;
        }

        // Enhanced error handling
        let errorMessage = 'Mint failed with unknown error';
        
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Error response:', {
                data: error.response.data,
                status: error.response.status,
                headers: error.response.headers
            });
            
            errorMessage = error.response.data?.error?.message || 
                           error.response.data?.error || 
                           `Server error: ${error.response.status}`;
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Error request:', error.request);
            errorMessage = 'No response from server. Please check your connection.';
        } else {
            // Something happened in setting up the request that triggered an Error
            errorMessage = error.message;
        }

        debouncedSetNotification({ message: `Mint Failed: ${errorMessage}`, type: 'error' });
    }
}

    // Helper function to validate if a string is a valid Solana public key
    function isValidPublicKey(address: string): boolean {
        try {
            new PublicKey(address);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Helper function to add to airdrop history (implement this according to your state management)
    function addToAirdropHistory(airdropInfo: {
        id: string | number;
        recipient: string;
        timestamp: string;
        transactionId: string;
    }) {
        // This is just a placeholder - implement according to your app's state management
        // For example, if using React state:
        // setAirdropHistory(prevHistory => [...prevHistory, airdropInfo]);
        console.log('Added to airdrop history:', airdropInfo);
    }

    async function createMerkleTree() {
        // Clear previous minted NFT
        setDisableCreateMerkle(true);
        try {

            const response = await axios.post('https://sshib-be.onrender.com/api/createMerkleTree', {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                //  timeout: 25000 // 25 seconds timeout
            });

            const _response = response.data;
            set_response(JSON.stringify(_response.treeAddress));
            console.log("_response : " + JSON.stringify(_response.success));
            console.log("treeAddress : " + JSON.stringify(_response.treeAddress));
            console.log("_response : " + JSON.stringify(_response.success));

        } catch (err) {
            console.log(err);
        }
    }

    async function createCollection() {
        // Clear previous minted NFT
        setDisableCreateCollection(true);

        try {

            const response = await axios.post('https://sshib-be.onrender.com/api/createCollection', {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                //  timeout: 25000 // 25 seconds timeout
            });

            const _response = response.data;
            set_response2(JSON.stringify(_response.collectionMint));

        } catch (err) {
            console.log(err);
        }
    }

    async function mintToCollection() {
        // Clear previous minted NFT
        setDisableMintToCollection(true);
        try {

            const response = await axios.post('https://sshib-be.onrender.com/api/mintToCollection', {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                //  timeout: 25000 // 25 seconds timeout
            });

            const _response = response.data;
            console.log("Minted NFT Asset ID:", _response);
            // You can now use assetId in your state or elsewhere
            setResponse3(_response);

        } catch (err) {
            console.log(err);
        }
    }

    // Utility functions
    const isUserRejection = (error: any): boolean => {
        if (!error) return false;
        const errorMessage = error.message?.toString()?.toLowerCase() || '';
        const errorName = error.name?.toString()?.toLowerCase() || '';
        return (
            errorMessage.includes('user rejected') ||
            errorMessage.includes('rejected') ||
            errorName.includes('user rejected')
        );
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopyAlert(true);
        setTimeout(() => setCopyAlert(false), 2000);
    };

    // Memoized styles
    const walletButtonStyle = useMemo(() => ({
        backgroundColor: 'white',
        color: 'black',
        borderRadius: '8px',
        padding: '10px 20px',
        fontSize: '16px',
        fontWeight: '600',
        transition: 'all 0.3s ease',
        border: '1px solid #e5e7eb'
    }), []);

    async function setAndVerifyCollection() {
        setDisableVerify(true);
        setErrorVerify('');
        set_responseVerify('Processing verification...');
        
        try {
            // Use the deployed API endpoint instead of localhost
            const apiUrl = process.env.NODE_ENV === 'production' 
                ? 'https://sshib-be.onrender.com/api/verifyCNFTCollection' 
                : 'https://sshib-be.onrender.com/api/verifyCNFTCollection';
                
            const response = await axios.post(
                apiUrl,
                {leafIndex: 1},
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    timeout: 60000 // Increase timeout for larger transactions
                }
            );
            
            const data = response.data;
            
            if (data.success) {
                set_responseVerify(`Verification successful! Transaction: ${data.transactionSignature.slice(0, 8)}...`);
                console.log("Full response:", data);
            } else {
                setErrorVerify(`Verification failed: ${data.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error("Verification error:", err);
            
            // Better error handling
            let errorMessage = 'An error occurred during verification.';
            
            if (err.response) {
                // Server responded with an error
                errorMessage = err.response.data.error || err.response.data.message || errorMessage;
                console.log("Error response data:", err.response.data);
            } else if (err.request) {
                // Request was made but no response
                errorMessage = 'No response from server. Please check your connection.';
            } else {
                // Error in setting up request
                errorMessage = err.message;
            }
            
            setErrorVerify(errorMessage);
        } finally {
            setDisableVerify(false);
        }
    }   
    
    return (
        <div>
            <div className="mint-details">
                <div className="mint-info">
                    <span id="txtColor">{totalMinted - 1} / 10,000 Minted</span>
                    <span id="txtColor">≡ {Number(perNFTPrice)} SOL* + GAS</span>
                </div>

                {lastMintedNft && (
                    <div style={{
                        margin: '0 auto 20px auto',
                        padding: '20px',
                        background: 'rgba(255, 255, 255, 0.9)',
                        borderRadius: '12px',
                        textAlign: 'center',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        maxWidth: '300px',
                        fontFamily: 'monospace',
                        position: 'relative'
                    }}>
                        <div
                            style={{
                                fontSize: '16px',
                                marginBottom: '15px',
                                color: '#000',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-block',
                                padding: '5px 10px',
                                backgroundColor: '#f5f5f5',
                                borderRadius: '4px'
                            }}
                            onClick={() => handleCopy(lastMintedNft.id)}
                            title="Click to copy"
                        >
                            Minted ID:<br />
                            {lastMintedNft.id.substring(0, 4)}...{lastMintedNft.id.substring(lastMintedNft.id.length - 6)}
                        </div>
                        {copyAlert && (
                            <div style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                background: '#4CAF50',
                                color: 'white',
                                padding: '5px 10px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                zIndex: 100
                            }}>
                                Copied!
                            </div>
                        )}
                        <a
                            href={`https://explorer.solana.com/address/${lastMintedNft.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginTop: '10px'
                            }}>
                                <img
                                    src={lastMintedNft.imageUrl}
                                    alt={lastMintedNft.name}
                                    style={{
                                        width: '200px',
                                        height: '200px',
                                        borderRadius: '8px',
                                        border: '2px solid #ddd',
                                        objectFit: 'cover',
                                        display: 'block'
                                    }}
                                    onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.src = 'https://placehold.co/200x200?text=NFT+Image';
                                    }}
                                />
                            </div>
                        </a>
                        <p style={{
                            marginTop: '12px',
                            fontSize: '16px',
                            color: '#000',
                            fontWeight: '500'
                        }}>
                            {lastMintedNft.name}
                        </p>
                    </div>
                )}

                <div className="wallet-button-container">
                    <WalletMultiButtonDynamic style={walletButtonStyle} />
                </div>

                {wallet.connected && (
                    <button className="mint-button" onClick={mintWithSolPayment}>
                        Mint Now
                    </button>
                )}

                {notification && (
                    <div className={`notification ${notification.type}`}>
                        {notification.message}
                    </div>
                )}
            </div>

            {/*<div>
                <button
                    onClick={setAndVerifyCollection}
                    id="otherBtns"
                    disabled={disableVerify}
                >
                    {disableVerify ? 'Verifing Collection...' : 'Verify Collection'}
                </button>
                <div id="coloumn">
                    <div id="response">
                        {_responseVerify}
                    </div>

                    <div id="response">
                        {errorVerify}
                    </div>
                    
                </div>
            </div>*/}

            <style jsx>{`
                .mint-details {
                    max-width: 400px;
                    margin: 0 auto;
                    text-align: center;
                }
                .nft-display {
                    background: rgba(255, 255, 255, 0.9);
                    border-radius: 12px;
                    padding: 20px;
                    margin: 20px auto;
                }
                .nft-id {
                    cursor: pointer;
                    margin-bottom: 15px;
                    padding: 5px 10px;
                    background: #f5f5f5;
                    border-radius: 4px;
                    display: inline-block;
                }
                .copy-alert {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: #4CAF50;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 4px;
                }
                .mint-button {
                    background: linear-gradient(45deg, #6e45e2, #88d3ce);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin-top: 20px;
                    transition: all 0.3s ease;
                }
                .mint-button:hover {
                    transform: scale(1.05);
                }
                .notification {
                    margin-top: 10px;
                    padding: 5px;
                    border-radius: 4px;
                    font-family: monospace;
                }
                .notification.error {
                    color: #F44336;
                }
                .notification.success {
                    color: #4CAF50;
                }
                .notification.info {
                    color: #2196F3;
                }
            `}</style>

            <AirdropPanel />

        </div>
    );
};
