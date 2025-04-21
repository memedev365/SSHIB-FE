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
            if (mintedCount >= 10000) {
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

            let transaction = new Transaction()
                .add(priorityFeeInstruction)
                .add(transferInstruction);

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = wallet.publicKey;

            console.log('Sending transaction...');
            const signature = await wallet.sendTransaction(transaction, connection);
            const txid = signature.toString();
            console.log(`Payment TXID: ${txid}`);

            debouncedSetNotification({ message: 'Processing payment...', type: 'info' });

            // Wait for payment confirmation
            console.log('Waiting for payment confirmation...');
            await connection.confirmTransaction(signature, 'confirmed');
            console.log('Payment confirmed on-chain');

            // 5. Call backend API to mint NFT - Keep loader visible
            console.log('[5/6] Calling backend mint API...');
            debouncedSetNotification({ message: 'Minting NFT...', type: 'info' });

            // Create payload object
            const payload = {
                userWallet: wallet.publicKey.toString(),
                paymentSignature: signature
            };

            // Using axios instead of fetch
            const response = await axios.post('http://localhost:3001/api/mint', payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                //  timeout: 25000 // 25 seconds timeout
            });

            // Access data directly from axios response
            const _response = response.data;
            const nftId = _response.nftId;
            const imageUrl = _response.imageUrl;
            const name = _response.name;

            console.log("_response : " + JSON.stringify(_response));

            console.log(`Minted NFT: ${name} (${nftId})`);
            debouncedSetNotification({ message: `Minted ${name} (${nftId})!`, type: 'success' });

            await new Promise(resolve => setTimeout(resolve, 2000));

            const mintTxid = _response.details.paymentVerification.transactionId;

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
                return;
            }

            // For axios errors, the error details are structured differently
            const errorMessage = error.response?.data?.error || error.message || 'Transaction failed';
            debouncedSetNotification({ message: `Mint Failed: ${errorMessage}`, type: 'error' });
        }
    }

    async function createMerkleTree() {
        // Clear previous minted NFT
        setDisableCreateMerkle(true);
        try {

            const response = await axios.post('http://localhost:3001/api/createMerkleTree', {
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

            const response = await axios.post('http://localhost:3001/api/createCollection', {
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

            const response = await axios.post('http://localhost:3001/api/mintToCollection', {
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
                            href={`https://solscan.io/token/${lastMintedNft.id}`}
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

            <div>
                <div>
                    <button
                        onClick={createMerkleTree}
                        id="otherBtns"
                        disabled={disableCreateMerkle}
                    >
                        {disableCreateMerkle ? 'Creating MerkleTree...' : 'Create MerkleTree'}
                    </button>
                    <div id="response">{_response}</div>
                </div>

                <div>
                    <button
                        onClick={createCollection}
                        id="otherBtns"
                        disabled={disableCreateCollection}
                    >
                        {disableCreateCollection ? 'Creating Collection...' : 'Create Collection'}
                    </button>
                    <div id="coloumn">
                        <div id="response">
                            {_response2}
                        </div>
                    </div>
                </div>

                <div>
                    <button
                        onClick={mintToCollection}
                        id="otherBtns"
                        disabled={disableMintToCollection}
                    >
                        {disableMintToCollection ? 'Minting...' : 'Mint To Collection'}
                    </button>
                </div>
                <div id="response">
                    {_response3 && <>Collection NFT Minted</>}
                </div>
            </div>

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

        </div>
    );
};