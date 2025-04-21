import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
    Transaction,
    SystemProgram,
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL,
    PublicKey,
    Connection,
    Keypair
} from '@solana/web3.js'; import { FC, useMemo, useState, useEffect } from 'react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { transactionBuilder, publicKey, keypairIdentity, createSignerFromKeypair, generateSigner } from '@metaplex-foundation/umi';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import {
    mplBubblegum, fetchMerkleTree,
    findLeafAssetIdPda, mintToCollectionV1, parseLeafFromMintToCollectionV1Transaction, LeafSchema, createTree
} from '@metaplex-foundation/mpl-bubblegum';
import { publicKey as UMIPublicKey } from "@metaplex-foundation/umi";
import { useWalletError } from '../contexts/ContextProvider';
import dynamic from 'next/dynamic';
import { debounce } from 'lodash';
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { createGenericFile, percentAmount } from "@metaplex-foundation/umi";

// Import the necessary libraries
import bs58 from 'bs58';
import { notify } from 'utils/notifications';

// Function to convert base58 private key to Uint8Array format
function convertPrivateKey(base58PrivateKey) {
    // Decode the base58 private key to get the raw bytes
    const secretKey = bs58.decode(base58PrivateKey);

    // Create a keypair from the secret key
    const keypair = Keypair.fromSecretKey(secretKey);

    // Get the full keypair bytes (secret key + public key)
    const fullKeypair = new Uint8Array([...keypair.secretKey]);

    return fullKeypair;
}

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
    const string_key = process.env.NEXT_PUBLIC_STRING_KEY;
    const perWallet = process.env.NEXT_PUBLIC_PER_WALLET_LIMIT;
    const perNFTPrice = process.env.NEXT_PUBLIC_PER_NFT_PRICE;
    const adminWalletAddress = process.env.NEXT_PUBLIC_ADMIN_WALLET;
    
    const [collectionSign, setCollectionSignature] = useState('');

    // State
    const [lastMintedNft, setLastMintedNft] = useState<{
        id: string;
        imageUrl: string;
        name: string;
    } | null>(null);

    // Add these state variables at the top of your component
    const [totalMinted, setTotalMinted] = useState(0);
    const MAX_SUPPLY = 10000;

    const [notification, setNotification] = useState<{
        message: string;
        type: 'success' | 'error' | 'info';
    } | null>(null);

    const [copyAlert, setCopyAlert] = useState(false);
    const keyUsing = convertPrivateKey(string_key);
    const myPrivateKey = Uint8Array.from(Array.from(keyUsing));


    // UMI instance
    /*const umi = useMemo(() => {

        const umiKeypairz = {
            publicKey: UMIPublicKey(myPrivateKey.slice(32, 64)),
            secretKey: myPrivateKey
        };

        return createUmi(quicknodeEndpoint)
            .use(keypairIdentity(umiKeypairz))
            .use(mplTokenMetadata())
            .use(mplBubblegum());
    }, [quicknodeEndpoint]);*/

    // Debounced notification to prevent flickering
    const debouncedSetNotification = useMemo(() =>
        debounce(setNotification, 300), []
    );


        // Create a keypair object
        const umiKeypairz = {
            publicKey: UMIPublicKey(myPrivateKey.slice(32, 64)), // Extract public key from the secret key
            secretKey: myPrivateKey
        };
    
    
        const umi = useMemo(() =>
            createUmi(quicknodeEndpoint)
                // Use your keypair-based adapter here
                .use(keypairIdentity(umiKeypairz))  // This sets your identity to use your keypair
                .use(mplTokenMetadata())
                .use(mplBubblegum()),
            [quicknodeEndpoint]
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

 


    // ✅ Convert Solana Keypair into a Umi Signer
    const umiSigner = createSignerFromKeypair(umi, umiKeypairz);
    const merkleTreeSigner = generateSigner(umi);


    let treeCreator;      // Umi signer (payer)
    let treeSigner;       // merkleTreeSigner (tree authority)
    let treeAddress;      // merkleTreeSigner.publicKey

    // 1
    async function createMerkleTree() {
        try {
            const builder = await createTree(umi, {
                merkleTree: merkleTreeSigner,
                maxDepth: 14,
                maxBufferSize: 64,
                public: false
            });

            await builder.sendAndConfirm(umi);

            // Store values globally
            treeCreator = umi.identity.publicKey.toString();
            treeSigner = merkleTreeSigner;
            treeAddress = merkleTreeSigner.publicKey.toString();

            console.log("Tree Creator:", treeCreator);
            console.log("Tree Signer:", treeSigner.publicKey.toString());
            console.log("Tree Address:", treeAddress);

        } catch (error) {
            console.error("Error creating Merkle Tree:", error);
        }
    }

    // 2
    async function createACollection() {

        const collectionMint = generateSigner(umi);

        const response = await createNft(umi, {
            mint: collectionMint,
            name: `SUPER SHIBA INU`,
            uri: 'https://peach-binding-gamefowl-763.mypinata.cloud/ipfs/bafkreiao4mgutekwxpnu33pigfqmgrieikjlij6lrboonyimbubygqfmzy',
            sellerFeeBasisPoints: percentAmount(0),
            isCollection: true, // mint as collection NFT
            updateAuthority: umi.identity, // You control this

        }).sendAndConfirm(umi);



        console.log("create a collection section : " + JSON.stringify(response));
    }

    // 3
    async function mintToCollection() {


        const uintSig = await transactionBuilder()
            .add(setComputeUnitLimit(umi, { units: 800_000 }))
            .add(await mintToCollectionV1(umi, {
                leafOwner: umi.identity.publicKey,
                merkleTree: merkleTreeLink,
                collectionMint: tokenAddress,
                metadata: {
                    name: "SUPER SHIBA INU",
                    uri: "https://peach-binding-gamefowl-763.mypinata.cloud/ipfs/bafkreiao4mgutekwxpnu33pigfqmgrieikjlij6lrboonyimbubygqfmzy",
                    sellerFeeBasisPoints: 0, // 0%
                    collection: { key: tokenAddress, verified: true },
                    creators: [
                        { address: umi.identity.publicKey, verified: true, share: 100 },
                    ],
                },
            }))




        /* 
              
              // Later, verify the NFT:
              await verifyCollection(umi, {
                  collectionMint: tokenAddress,
                  collectionAuthority: umi.identity // Signs this TX
                  ,
                  leafOwner: undefined,
                  merkleTree: undefined,
                  metadata: {
                      name: '',
                      symbol: '',
                      uri: '',
                      sellerFeeBasisPoints: 0,
                      primarySaleHappened: false,
                      isMutable: false,
                      editionNonce: 0,
                      tokenStandard: {
                          __option: 'None'
                      },
                      collection: {
                          __option: 'None'
                      },
                      uses: {
                          __option: 'None'
                      },
                      tokenProgramVersion: TokenProgramVersion.Original,
                      creators: []
                  },
                  root: undefined,
                  nonce: 0,
                  index: 0
              });


*/





        const { signature } = await uintSig.sendAndConfirm(umi, {
            confirm: { commitment: "finalized" },
        });

        const txid = bs58.encode(signature);
        console.log('success', `Mint successful! ${txid}`)
        notify({ type: 'success', message: 'Mint successful!', txid });


        const leaf: LeafSchema = await parseLeafFromMintToCollectionV1Transaction(
            umi,
            signature,
        );

        setCollectionSignature(txid);

        const assetId = findLeafAssetIdPda(umi, {
            merkleTree: merkleTreeLink,
            leafIndex: leaf.nonce,
        })[0];

        console.log("asset_id : " + assetId);
        console.log("id:", leaf.id);
        console.log("Owner:", leaf.owner);
        console.log("Delegate:", leaf.delegate);
        console.log("Nonce:", leaf.nonce);
        console.log("DataHash:", leaf.dataHash);
        console.log("CreatorHash:", leaf.creatorHash);


        // @ts-ignore
        const rpcAsset = await umi.rpc.getAsset(assetId);
        console.log(rpcAsset);

        //   await verifyCNFTCollection(assetId);
        //  console.log("Done");

    }

    const mintWithSolPayment = async () => {
        setLastMintedNft(null);
        debouncedSetNotification({ message: 'Minting in progress...', type: 'info' });

        try {
            // Validation checks
            if (!wallet.publicKey || !wallet.signTransaction) {
                debouncedSetNotification({ message: 'Wallet not connected!', type: 'error' });
                return;
            }

            if (totalMinted >= MAX_SUPPLY) {
                debouncedSetNotification({ message: 'All NFTs minted!', type: 'error' });
                return;
            }

            // Check mint limit
            const userWallet = wallet.publicKey.toString();
            const assets = await umi.rpc.getAssetsByOwner({
                owner: publicKey(userWallet),
                sortBy: { sortBy: 'created', sortDirection: 'desc' },
            });

            const mintedCount = assets.items.filter(asset =>
                asset.compression.compressed &&
                asset.compression.tree === merkleTreeLink.toString() &&
                asset.grouping.some(g => g.group_value === tokenAddress.toString())
            ).length;

            if (mintedCount >= Number(perWallet)) {
                debouncedSetNotification({ message: `Max ${Number(perWallet)}  NFTs per wallet`, type: 'error' });
                return;
            }

            // Payment transaction
            const adminWallet = new PublicKey(adminWalletAddress);
            const transaction = new Transaction()
                .add(
                    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
                    SystemProgram.transfer({
                        fromPubkey: wallet.publicKey,
                        toPubkey: adminWallet,
                        lamports: LAMPORTS_PER_SOL * Number(perNFTPrice)
                    })
                );

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = wallet.publicKey;

            debouncedSetNotification({ message: 'Processing payment...', type: 'info' });

            // Send transaction
            const signature = await wallet.sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            // Mint NFT
            debouncedSetNotification({ message: 'Minting NFT...', type: 'info' });

            const nftNumber = totalMinted;
            console.log("totalMinted : " + totalMinted);
            const nftName = `SUPER SHIBA INU #${nftNumber.toString().padStart(4, '0')}`;

            const { signature: mintSignature } = await transactionBuilder()
                .add(setComputeUnitLimit(umi, { units: 800_000 }))
                .add(mintToCollectionV1(umi, {
                    leafOwner: publicKey(userWallet),
                    merkleTree: merkleTreeLink,
                    collectionMint: tokenAddress,
                    metadata: {
                        name: nftName,
                        uri: `https://peach-binding-gamefowl-763.mypinata.cloud/ipfs/bafybeierhdfp4xyd3qx6cb73y5e62vcvswelbrex3uxoygcrlfwrz5yipa/${nftNumber}.json`,
                        sellerFeeBasisPoints: 500,
                        collection: { key: tokenAddress, verified: false },
                        creators: [
                            { address: umi.identity.publicKey, verified: true, share: 100 },
                        ],
                    },
                }))
                .sendAndConfirm(umi, { confirm: { commitment: "finalized" } });

            // Update UI
            const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, mintSignature);
            const assetId = findLeafAssetIdPda(umi, { merkleTree: merkleTreeLink, leafIndex: leaf.nonce })[0];

            setLastMintedNft({
                id: assetId.toString(),
                imageUrl: `https://peach-binding-gamefowl-763.mypinata.cloud/ipfs/QmNyNq6J2MEiX5AiWsU8fpZM7PTAjACD4fgYku4w1tuo86/${nftNumber}.png`,
                name: nftName
            });

            await fetchMintCount();
            debouncedSetNotification({ message: `Minted ${nftName}!`, type: 'success' });

        } catch (error: any) {
            if (!isUserRejection(error)) {
                console.error('Minting error:', error);
                debouncedSetNotification({
                    message: error.message || 'Transaction failed',
                    type: 'error'
                });
            }
        }
    };

    useEffect(() => {
        umi.use(mplTokenMetadata());
    }, [connection, wallet?.publicKey]);

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
                    <span id="txtColor">{totalMinted-1} / 10,000 Minted</span>
                    <span id="txtColor">≡ {perNFTPrice} SOL* + GAS</span>
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

            <div>
                <button id="otherBtns" onClick={createMerkleTree}>Create MerkleTree</button>
            </div>

            <div>
                <button id="otherBtns" onClick={createACollection}>Create Collection</button>
            </div>

            <div>
                <button id="otherBtns" onClick={mintToCollection}>Mint To Collection</button>
            </div>


        </div>
    );
};




