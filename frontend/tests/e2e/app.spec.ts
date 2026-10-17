import {test,expect,type Page} from '@playwright/test';

const ACCOUNT='0x1111111111111111111111111111111111111111';
const ACCOUNT_B='0x3333333333333333333333333333333333333333';
const CHAIN='0xf22f';

async function installWallet(page:Page,{authorized=true}:{authorized?:boolean}={}){
  await page.addInitScript(({account,accountB,chain,authorized})=>{
    const listeners=new Map<string,Set<(...args:unknown[])=>void>>();
    const state={account,accounts:authorized?[account]:[],chain,rejectConnect:false,rejectSign:false};
    const emit=(event:string,...args:unknown[])=>listeners.get(event)?.forEach(fn=>fn(...args));
    (window as any).ethereum={
      request:async(request:{method:string;params?:unknown[]})=>{
        const {method,params}=request;
        if(method==='eth_requestAccounts'){if(state.rejectConnect)throw Object.assign(new Error('User rejected wallet connection'),{code:4001});if(!state.accounts.length)state.accounts=[state.account];return state.accounts;}
        if(method==='eth_accounts')return state.accounts;
        if(method==='eth_chainId')return state.chain;
        // genlayer-js performs these read-only transaction-preparation calls
        // before it reaches eth_sendTransaction. Keep the fixture hermetic so
        // a provider outage cannot mask a wallet-signature assertion.
        if(method==='eth_getTransactionCount')return '0x0';
        if(method==='eth_estimateGas')return '0x30d40';
        if(method==='eth_gasPrice')return '0x0';
        if(method==='wallet_switchEthereumChain'){state.chain=String((params as any)?.[0]?.chainId||chain);emit('chainChanged',state.chain);return null;}
        if(method==='wallet_addEthereumChain'){state.chain=chain;emit('chainChanged',state.chain);return null;}
        if(method==='wallet_getSnaps')return {};
        if(method==='wallet_requestSnaps')return {};
        if(method==='eth_sendTransaction'){if(state.rejectSign)throw Object.assign(new Error('User rejected transaction signature'),{code:4001});return '0x'+'a'.repeat(64);}
        throw new Error('Unsupported wallet method '+method);
      },
      on:(event:string,fn:(...args:unknown[])=>void)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(fn)},
      removeListener:(event:string,fn:(...args:unknown[])=>void)=>listeners.get(event)?.delete(fn),
      emit,
      state,
      switchAccount:(next:string)=>{state.accounts=[next];state.account=next;emit('accountsChanged',state.accounts)},
      switchChain:(next:string)=>{state.chain=next;emit('chainChanged',next)},
    };
    (window as any).__clausebidTest={accountB};
  },{account:ACCOUNT,accountB:ACCOUNT_B,chain:CHAIN,authorized});
}

test.beforeEach(async({page})=>{await installWallet(page);});

test('navigates all seven screens and preserves mobile navigation',async({page})=>{
  await page.goto('/#/home');
  for(const [label,heading] of [['Marketplace','Discover procurements.'],['Create','Create a procurement.'],['Auction room','Auction #1'],['Delivery','Delivery #1'],['My dashboard','My procurement dashboard.'],['Audit','The audit explorer.'],['Home',"The lowest bid"]] as const){
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.getByRole('heading',{name:heading}).first()).toBeVisible();
    if(label==='Marketplace'){
      await expect(page.getByRole('heading',{name:'Individual claim ledger'})).toHaveCount(0);
      await expect(page.getByRole('button',{name:'Claim native GEN'})).toHaveCount(0);
    }
    if(label==='Create'){
      await expect(page.getByRole('button',{name:'Fund and publish procurement'})).toBeVisible();
      const commitField=page.locator('label.field').filter({hasText:'Commitment duration'});
      const revealField=page.locator('label.field').filter({hasText:'Reveal duration'});
      await expect(commitField.locator('input')).toHaveValue('1');
      await expect(revealField.locator('input')).toHaveValue('2');
      await expect(page.getByText('Total bidding')).toBeVisible();
      await commitField.locator('input').fill('49');
      await expect(page.getByRole('button',{name:'Fund and publish procurement'})).toBeDisabled();
      await commitField.locator('input').fill('24');
      await commitField.locator('select').selectOption('hours');
      await revealField.locator('input').fill('48');
      await revealField.locator('select').selectOption('hours');
      await expect(page.getByRole('strong').filter({hasText:'3 days'}).first()).toBeVisible();
      await expect(page.getByText(/read failed|failed to fetch version/i)).toHaveCount(0);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('button',{name:'Marketplace',exact:true})).toBeVisible();
});

test('handles wallet connection rejection, signing rejection, account changes and chain changes',async({page})=>{
  await installWallet(page,{authorized:false});
  await page.goto('/#/dashboard');
  await page.evaluate(()=>{(window as any).ethereum.state.rejectConnect=true});
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('rejected',{timeout:10000});
  await page.evaluate(()=>{(window as any).ethereum.state.rejectConnect=false});
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('button',{name:/Copy wallet address/})).toBeVisible();
  await page.getByRole('button',{name:/Copy wallet address/}).click();
  await expect(page.getByRole('button',{name:/Copy wallet address/})).toContainText('Copied');
  await expect(page.getByRole('button',{name:'Disconnect wallet',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Disconnect wallet',exact:true}).click();
  await expect(page.getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await page.goto('/#/auction/1');
  await expect(page.getByRole('heading',{name:'Auction #1'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Save reveal backup and commit/})).toBeEnabled();
  await page.evaluate(()=>{(window as any).ethereum.state.rejectSign=true});
  await page.getByLabel('All-in price in GEN').fill('4');
  await page.getByLabel('Complete offer terms').fill('All four requirements are addressed.');
  await page.getByRole('button',{name:/Save reveal backup and commit/}).click();
  await expect(page.getByRole('alert')).toContainText('rejected',{timeout:10000});
  await page.evaluate((next)=>{(window as any).ethereum.switchAccount(next)},ACCOUNT_B);
  await expect(page.getByRole('alert')).toContainText('account changed');
  await page.evaluate(()=>{(window as any).ethereum.switchChain('0x1')});
  await expect(page.getByRole('alert')).toContainText('Studionet 61999');
  await page.evaluate(()=>{(window as any).ethereum.switchChain('0xf22f')});
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('button',{name:/Copy wallet address/})).toBeVisible();
});

test('restores an already-authorized wallet after refresh and documents local disconnect policy',async({page})=>{
  await page.goto('/#/dashboard');
  await expect(page.getByRole('button',{name:'Disconnect wallet',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Disconnect wallet',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Disconnect wallet',exact:true}).click();
  await expect(page.getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button',{name:'Disconnect wallet',exact:true})).toBeVisible();
});

test('shows reserved review resume controls instead of unsafe restart/cancel',async({page})=>{
  await page.goto('/#/auction/1');
  await expect(page.getByRole('button',{name:'Resume evaluation'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Cancel stale review'})).toBeDisabled();
  await expect(page.getByText('Reservation is protected until review grace expires.')).toBeVisible();
  await page.goto('/#/delivery/1');
  await expect(page.getByRole('button',{name:'Resume neutral review'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reserve & run neutral review'})).toHaveCount(0);
});

test('recovers persisted transactions and exposes the claim audit ledger',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('clausebid:pending',JSON.stringify([{hash:'0x'+'b'.repeat(64),action:'claim',phase:'submitted',timestamp:Date.now()}])));
  await page.goto('/#/audit');
  await expect(page.getByRole('heading',{name:'Individual claim ledger'})).toBeVisible();
  await expect(page.getByText('Claim #1')).toBeVisible();
  await expect(page.getByText('Dispatched Pending External Settlement')).toBeVisible();
  await expect(page.getByText('Wallet transaction history')).toBeVisible();
  await expect(page.getByText('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBeVisible();
});
