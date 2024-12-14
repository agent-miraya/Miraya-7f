// test/test.ts
import { LitWrapper, LitTester } from '../dist/index.js';
import { expect } from 'chai';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const ETHEREUM_PRIVATE_KEY = process.env.ETHEREUM_PRIVATE_KEY;
const PINATA_API_KEY = process.env.PINATA_API_KEY;

if (!ETHEREUM_PRIVATE_KEY) {
    throw new Error('ETHEREUM_PRIVATE_KEY is required');
}

describe('Lit Wrapper SDK Tests', function() {
    this.timeout(60000); // Set timeout to 60 seconds for all tests
    
    let litWrapper: LitWrapper;
    let litTester: LitTester;

    const litActionCode = `
        const go = async () => {
            const sigShare = await LitActions.signEcdsa({ toSign: dataToSign, publicKey, sigName });
            LitActions.setResponse({ response: sigShare });
        };
        go();
    `;

    before(async () => {
        litWrapper = new LitWrapper('datil-dev');
        litTester = await LitTester.init(ETHEREUM_PRIVATE_KEY, 'datil-dev');
    });

    describe('PKP Creation', () => {
        it('should create a PKP', async () => {
            const result = await litWrapper.createPKP(ETHEREUM_PRIVATE_KEY);
            expect(result).to.have.property('tokenId');
            expect(result).to.have.property('publicKey');
            expect(result).to.have.property('ethAddress');
        });
    });

    describe('Lit Action Testing', () => {
        it('should test Lit Action directly', async () => {
            const dataToSign = ethers.utils.arrayify(ethers.utils.keccak256([1, 2, 3]));
            const result = await litTester.testLitAction(litActionCode, {
                dataToSign,
                sigName: 'test-sig'
            });
            expect(result).to.have.property('response');
        });
    });

    describe('PKP with Lit Action', () => {
        it('should create PKP with Lit Action if PINATA_API_KEY is available', async () => {
            if (!PINATA_API_KEY) {
                console.log('Skipping PKP with Lit Action test - PINATA_API_KEY not provided');
                return;
            }

            const result = await litWrapper.createPKPWithLitAction(
                ETHEREUM_PRIVATE_KEY,
                litActionCode,
                PINATA_API_KEY
            );
            expect(result).to.have.property('pkp');
            expect(result).to.have.property('ipfsCID');
        });
    });

    describe('Solana Wrapped Key', () => {
        it('should create a Solana Wrapped Key', async () => {
            const result = await litWrapper.createSolanaWK(ETHEREUM_PRIVATE_KEY);
            expect(result).to.have.property('pkpAddress');
            expect(result).to.have.property('id');
            expect(result).to.have.property('generatedPublicKey');
        });

        it('should send a Solana transaction with Wrapped Key', async () => {
            const wkResponse = await litWrapper.createSolanaWK(ETHEREUM_PRIVATE_KEY);
            if (!wkResponse) {
                throw new Error('wkResponse is undefined');
            }
            const result = await litWrapper.sendSolanaWKTxn(
                wkResponse,
                ETHEREUM_PRIVATE_KEY,
                false
            );
            expect(result).to.not.be.undefined;
        });
    });
});