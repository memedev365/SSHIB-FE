// Import the necessary libraries
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// Function to convert base58 private key to Uint8Array format
function convertPrivateKey(base58PrivateKey) {
  // Decode the base58 private key to get the raw bytes
  const secretKey = bs58.decode(base58PrivateKey);
  
  // Create a keypair from the secret key
  const keypair = Keypair.fromSecretKey(secretKey);
  
  // Get the full keypair bytes (secret key + public key)
  const fullKeypair = new Uint8Array([...keypair.secretKey]);
  
  // Display the array format for use in code
  console.log('Private key as Uint8Array:');
  console.log('[');
  for (let i = 0; i < fullKeypair.length; i += 8) {
    const chunk = fullKeypair.slice(i, Math.min(i + 8, fullKeypair.length));
    console.log('    ' + Array.from(chunk).join(', ') + (i + 8 < fullKeypair.length ? ',' : ''));
  }
  console.log(']');
  
  return fullKeypair;
}

// Replace 'YOUR_BASE58_PRIVATE_KEY' with your actual private key from Phantom
const myPrivateKey = convertPrivateKey('4z6S3ptvBFH4xuw2Wt7odhdsT5gFh7RgjADa7RWdisfN7AHxs9SYozBfYhL2yPexMQwCLH8Tw2pLTdrnkevX3v2c');