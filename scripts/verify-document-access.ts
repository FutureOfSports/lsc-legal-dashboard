/** Current two-person access policy against an explicitly disposable database. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { documentScope, requireDocumentAccess, isGlobalDocumentUser, requestDocumentAccess, DocumentAccessDenied, GLOBAL_DOCUMENT_EMAILS } from '../src/lib/document-access'
import type { SessionPayload } from '../src/lib/session'

async function main() {
  if (!new URL(process.env.DATABASE_URL ?? '').pathname.startsWith('/legal_os_v2_verify_')) throw new Error('This check requires a disposable legal_os_v2_verify_ database.')
  const run = randomUUID(), actors: SessionPayload[] = [], docIds: string[] = []
  for (const email of [...GLOBAL_DOCUMENT_EMAILS, 'legal@futureofsports.io', 'arvind@futureofsports.io', 'anuj@futureofsports.io', 'outsider@example.test']) {
    const user = await prisma.appUser.upsert({ where: { email }, create: { email, full_name: 'Verification account', password_hash: '!verification-only', role: 'PLATFORM_ADMIN', is_active: true }, update: {} })
    actors.push({ userId: user.id, email, role: user.role, fullName: user.full_name, exp: Date.now() + 60_000 })
  }
  const owner = actors[0]
  try {
    const doc = await prisma.legalDocument.create({ data: { title: `V2Test ${run}`, entity: 'FSP', category: 'OTHER', owner_id: owner.userId } }); docIds.push(doc.id)
    for (const actor of actors.slice(0, 2)) {
      assert.equal(await isGlobalDocumentUser(actor), true)
      await requireDocumentAccess(actor, doc.id)
    }
    for (const actor of actors.slice(2)) {
      assert.equal(await isGlobalDocumentUser(actor), false, 'Administrator role cannot widen the owner restriction')
      await prisma.documentAccessGrant.create({ data: { user_id: actor.userId, document_id: doc.id, granted_by: owner.userId, expires_at: new Date(Date.now() + 60_000) } })
      assert.equal(await prisma.legalDocument.count({ where: { AND: [{ id: doc.id }, await documentScope(actor)] } }), 0)
      await assert.rejects(requireDocumentAccess(actor, doc.id), DocumentAccessDenied)
      await assert.rejects(requestDocumentAccess(actor, 'reference', 'reason'), DocumentAccessDenied)
    }
    assert.equal(await isGlobalDocumentUser({ ...owner, email: actors[2].email }), false)
    await assert.rejects(requireDocumentAccess({ ...owner, exp: Date.now() - 1 }, doc.id), DocumentAccessDenied)
    const request = await requestDocumentAccess(owner, `unknown-reference-${run}`, 'Need access for review')
    const duplicate = await requestDocumentAccess(owner, `unknown-reference-${run}`, 'Need access for review')
    assert.equal(request.id, duplicate.id); assert.equal(request.document_id, null)
    await prisma.appUser.update({ where: { id: owner.userId }, data: { is_active: false } })
    await assert.rejects(requireDocumentAccess(owner, doc.id), DocumentAccessDenied)
    console.log('Document access passed: Adi/AK, former users and administrator denial even with scoped grants, expired session, current account revocation and nonresolving requests.')
  } finally {
    await prisma.appUser.update({ where: { id: owner.userId }, data: { is_active: true } })
    await prisma.documentAccessRequest.deleteMany({ where: { reference: `unknown-reference-${run}` } })
    await prisma.legalDocument.deleteMany({ where: { id: { in: docIds } } })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
