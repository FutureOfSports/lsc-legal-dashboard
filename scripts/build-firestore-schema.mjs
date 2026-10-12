/** Compile the existing legal model contract for the Firestore persistence layer. */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import internals from '@prisma/internals'

const source = await readFile('prisma/schema.prisma', 'utf8')
const { datamodel } = await internals.getDMMF({ datamodel: source })
const manifest = {
  version: 1,
  hash: createHash('sha256').update(source).digest('hex'),
  enums: Object.fromEntries(datamodel.enums.map(item => [item.name, item.values.map(value => value.name)])),
  models: datamodel.models.map(model => ({
    name: model.name,
    delegate: model.name[0].toLowerCase() + model.name.slice(1),
    fields: model.fields,
    uniques: model.fields.filter(field => field.isUnique || field.isId).map(field => [field.name]).concat(model.uniqueFields),
  })),
}
await mkdir('src/lib/firestore', { recursive: true })
await writeFile('src/lib/firestore/schema.json', JSON.stringify(manifest, null, 2) + '\n')
console.log(`Firestore schema: ${manifest.models.length} models, ${manifest.hash}`)
