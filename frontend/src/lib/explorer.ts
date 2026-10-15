export const STUDIONET_EXPLORER = 'https://explorer-studio.genlayer.com';

export function transactionExplorerUrl(hash:string):string{
 return `${STUDIONET_EXPLORER}/tx/${hash}`;
}
