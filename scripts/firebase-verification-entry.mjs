/** Only isolated operator-authenticated verification may inject a local Firestore client. */
import { operatorFirestore } from './firestore-google-client.ts'
const database = process.env.LEGAL_FIRESTORE_DATABASE ?? ''
if (!/^legal-os-verify-\d{8}$/.test(database)) throw new Error('Native runtime verification requires an isolated Legal database')
globalThis.legalFirestoreConnections ??= new Map()
globalThis.legalFirestoreConnections.set(`${process.env.LEGAL_FIRESTORE_PROJECT}/${database}`, operatorFirestore(database))
export { legalApp } from '../ops/firebase/index.mjs'
