/** Firestore implementation of the legal data contract. Writes are staged until every read is complete. */
import { Firestore, type Transaction } from '@google-cloud/firestore'
import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@/generated/prisma/client'
import { compare, decode, encode, equal, modelByDelegate, modelByName, models, normalize, plain, record, type Field, type Model, type Row } from './codec'
import { PayloadStore } from './payloads'

const readMethods = new Set(['findMany', 'findUnique', 'findFirst', 'findUniqueOrThrow', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy'])
const writeMethods = new Set(['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'])
const shared = globalThis as typeof globalThis & { legalFirestoreConnections?: Map<string, Firestore> }
const connections = shared.legalFirestoreConnections ??= new Map<string, Firestore>()
export function legalFirestore() {
  const projectId = process.env.LEGAL_FIRESTORE_PROJECT
  const databaseId = process.env.LEGAL_FIRESTORE_DATABASE
  if (!projectId || !databaseId || databaseId === '(default)' || databaseId === 'fspbots') throw new Error('An explicit dedicated Legal Firestore project and database are required')
  const key = `${projectId}/${databaseId}`
  let client = connections.get(key)
  if (!client) { client = new Firestore({ projectId, databaseId, ignoreUndefinedProperties: false }); connections.set(key, client) }
  return client
}
function error(code: string, message: string, meta?: Row): never {
  throw new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: Prisma.prismaVersion.client, meta })
}
function relationTarget(model: Model, field: Field): { model: Model; from: string[]; to: string[] } {
  const target = modelByName.get(field.type)
  if (!target) throw new Error('Unknown relation target')
  if (field.relationFromFields?.length) return { model: target, from: field.relationFromFields, to: field.relationToFields! }
  const reverse = target.fields.find(item => item.kind === 'object' && item.type === model.name
    && item.relationName === field.relationName && item.relationFromFields?.length)
  if (!reverse) throw new Error(`Unsupported relation: ${model.name}.${field.name}`)
  return { model: target, from: reverse.relationToFields!, to: reverse.relationFromFields! }
}
function defaultValue(field: Field): unknown {
  const value = field.default
  if (plain(value)) {
    if (value.name === 'uuid') return randomUUID()
    if (value.name === 'now') return new Date()
    throw new Error(`Unsupported schema default: ${field.name}`)
  }
  return value
}
function equalityPlan(model: Model, value: unknown): Row {
  if (!plain(value)) return {}
  const output: Row = {}
  for (const [key, condition] of Object.entries(value)) {
    if (key === 'AND') {
      for (const input of Array.isArray(condition) ? condition : [condition]) Object.assign(output, equalityPlan(model, input))
      continue
    }
    const field = model.fields.find(item => item.name === key)
    if (!field) {
      if (model.uniques.some(fields => fields.join('_') === key)) Object.assign(output, equalityPlan(model, condition))
      continue
    }
    if (field.kind === 'object' || field.type === 'Json' || field.isList || condition === undefined) continue
    const equals = plain(condition) && 'equals' in condition && !condition.mode ? condition.equals : condition
    if (plain(equals)) continue
    if (typeof equals === 'string' && Buffer.byteLength(equals) >= 1024) continue
    output[key] = equals
  }
  return output
}

class Context {
  private loaded = new Map<string, Promise<Row[]>>()
  private changes = new Map<string, Map<string, Row | null>>()
  private epochs = new Map<string, Promise<unknown>>()
  constructor(readonly db: Firestore, readonly transaction?: Transaction, readonly payloads?: PayloadStore) {}
  async rows(model: Model, equality: Row = {}): Promise<Row[]> {
    const key = `${model.name}:${JSON.stringify(equality)}`
    let pending = this.loaded.get(key)
    if (!pending) {
      pending = (async () => {
        // The epoch locks collection predicates against concurrent inserts/deletes.
        if (this.transaction) {
          if (!this.epochs.has(model.name)) this.epochs.set(model.name, this.transaction.get(this.db.doc(`legal_epochs/${model.name}`)))
          await this.epochs.get(model.name)
        }
        if (typeof equality.id === 'string') {
          const reference = this.db.collection(model.name).doc(equality.id)
          const snapshot = this.transaction ? await this.transaction.get(reference) : await reference.get()
          return snapshot.exists ? [decode(model, this.payloads ? await this.payloads.unpack(snapshot.data()!) : snapshot.data()!)] : []
        }
        let ref = this.db.collection(model.name).limit(50_001)
        // One equality index narrows the read set; the full predicate is still checked below.
        const first = Object.entries(equality)[0]
        if (first) {
          const field = model.fields.find(field => field.name === first[0])!
          const normalized = normalize(field, first[1])
          ref = ref.where(first[0], '==', normalized instanceof Date ? normalized.toISOString() : normalized instanceof Prisma.Decimal ? normalized.toFixed() : normalized)
        }
        const snapshot = this.transaction ? await this.transaction.get(ref) : await ref.get()
        if (snapshot.size > 50_000) throw new Error('Legal collection requires a paginated query plan')
        return Promise.all(snapshot.docs.map(async doc => decode(model, this.payloads ? await this.payloads.unpack(doc.data()) : doc.data())))
      })()
      this.loaded.set(key, pending)
    }
    const initial = await pending
    const merged = new Map(initial.map(row => [String(row.id), row]))
    for (const [id, value] of this.changes.get(model.name) ?? []) {
      if (value) merged.set(id, value); else merged.delete(id)
    }
    return [...merged.values()].filter(row => Object.entries(equality).every(([key, value]) => equal(row[key], value)))
  }
  stage(model: Model, row: Row | null, id: string) {
    let changes = this.changes.get(model.name)
    if (!changes) { changes = new Map(); this.changes.set(model.name, changes) }
    changes.set(id, row)
  }
  async related(model: Model, row: Row, field: Field): Promise<Row[]> {
    const relation = relationTarget(model, field)
    if (relation.from.some(key => row[key] == null)) return []
    return this.rows(relation.model, Object.fromEntries(relation.to.map((key, index) => [key, row[relation.from[index]]])))
  }
  async matches(model: Model, row: Row, value: unknown): Promise<boolean> {
    if (value === undefined) return true
    const where = record(value)
    for (const [key, condition] of Object.entries(where)) {
      if (condition === undefined) continue
      if (['AND', 'OR', 'NOT'].includes(key)) {
        const tests = await Promise.all((Array.isArray(condition) ? condition : [condition]).map(item => this.matches(model, row, item)))
        if (key === 'AND' && tests.some(result => !result)) return false
        if (key === 'OR' && !tests.some(Boolean)) return false
        if (key === 'NOT' && tests.some(Boolean)) return false
        continue
      }
      const field = model.fields.find(item => item.name === key)
      if (!field) {
        const compound = model.uniques.find(fields => fields.join('_') === key)
        if (compound && plain(condition)) { if (!await this.matches(model, row, condition)) return false; continue }
        throw new Error(`Unsupported predicate: ${model.name}.${key}`)
      }
      if (field.kind === 'object') {
        const related = await this.related(model, row, field)
        const target = modelByName.get(field.type)!
        if (condition === null) { if (related.length) return false; continue }
        const filter = record(condition)
        if (field.isList) {
          for (const [operator, predicate] of Object.entries(filter)) {
            const tests = await Promise.all(related.map(item => this.matches(target, item, predicate)))
            if (operator === 'some' && !tests.some(Boolean) || operator === 'none' && tests.some(Boolean) || operator === 'every' && tests.some(test => !test)) return false
            if (!['some', 'none', 'every'].includes(operator)) throw new Error('Unsupported list relation filter')
          }
        } else if ('is' in filter || 'isNot' in filter) {
          for (const [operator, predicate] of Object.entries(filter)) {
            const result = predicate === null ? related.length === 0 : related.length > 0 && await this.matches(target, related[0], predicate)
            if (operator === 'is' && !result || operator === 'isNot' && result) return false
            if (!['is', 'isNot'].includes(operator)) throw new Error('Unsupported relation filter')
          }
        } else if (!related.length || !await this.matches(target, related[0], filter)) return false
      } else if (field.type === 'Json' && plain(condition) && 'path' in condition) {
        if (!Array.isArray(condition.path) || !condition.path.every(key => typeof key === 'string')) throw new Error('Invalid JSON predicate path')
        let value: unknown = row[key]
        for (const segment of condition.path) {
          if (value === null || typeof value !== 'object' || !(segment in value)) return false
          value = record(value)[segment]
        }
        const filter = { ...condition }
        delete filter.path
        if (!this.scalar(value, filter)) return false
      } else if (!this.scalar(row[key], condition)) return false
    }
    return true
  }
  scalar(value: unknown, condition: unknown): boolean {
    if (condition === Prisma.DbNull || condition === Prisma.JsonNull || condition === Prisma.AnyNull || !plain(condition)) return equal(value, condition)
    const insensitive = condition.mode === 'insensitive'
    for (const [operator, expected] of Object.entries(condition)) {
      if (operator === 'mode' || expected === undefined) continue
      const left = insensitive && typeof value === 'string' ? value.toLowerCase() : value
      const right = insensitive && typeof expected === 'string' ? expected.toLowerCase() : expected
      if (operator === 'equals' && !equal(left, right)) return false
      else if (operator === 'not' && (value === null || this.scalar(left, right))) return false
      else if (operator === 'in' && (!Array.isArray(expected) || !expected.some(item => equal(left, insensitive && typeof item === 'string' ? item.toLowerCase() : item)))) return false
      else if (operator === 'notIn' && (value === null || !Array.isArray(expected) || expected.some(item => equal(left, item)))) return false
      else if (['lt', 'lte', 'gt', 'gte'].includes(operator)) {
        if (value === null) return false
        const result = compare(left, right)
        if (operator === 'lt' && result >= 0 || operator === 'lte' && result > 0 || operator === 'gt' && result <= 0 || operator === 'gte' && result < 0) return false
      } else if (['contains', 'startsWith', 'endsWith'].includes(operator)) {
        if (typeof left !== 'string' || typeof right !== 'string') return false
        if (operator === 'contains' && !left.includes(right) || operator === 'startsWith' && !left.startsWith(right) || operator === 'endsWith' && !left.endsWith(right)) return false
      } else if (operator === 'has' && (!Array.isArray(value) || !value.some(item => equal(item, expected)))) return false
      else if (operator === 'hasSome' && (!Array.isArray(value) || !Array.isArray(expected) || !expected.some(item => value.some(actual => equal(actual, item))))) return false
      else if (operator === 'hasEvery' && (!Array.isArray(value) || !Array.isArray(expected) || !expected.every(item => value.some(actual => equal(actual, item))))) return false
      else if (operator === 'isEmpty' && (!Array.isArray(value) || (value.length === 0) !== expected)) return false
      else if (!['equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'endsWith', 'has', 'hasSome', 'hasEvery', 'isEmpty'].includes(operator)) throw new Error(`Unsupported scalar filter: ${operator}`)
    }
    return true
  }
  async ordered(model: Model, rows: Row[], value: unknown): Promise<Row[]> {
    if (!value) return rows
    const specs = Array.isArray(value) ? value : [value]
    const keyed = await Promise.all(rows.map(async row => {
      const values: { value: unknown; direction: unknown }[] = []
      for (const spec of specs) for (const [key, direction] of Object.entries(record(spec))) {
        const field = model.fields.find(item => item.name === key)
        if (field?.kind === 'object' && plain(direction)) {
          const relation = await this.related(model, row, field)
          for (const [nested, sort] of Object.entries(direction)) values.push({ value: nested === '_count' ? relation.length : relation[0]?.[nested] ?? null, direction: sort })
        } else if (key === '_count' && plain(direction)) {
          for (const [nested, sort] of Object.entries(direction)) values.push({ value: typeof row._count === 'number' ? row._count : record(row._count)[nested], direction: sort })
        } else values.push({ value: row[key], direction })
      }
      return { row, values }
    }))
    keyed.sort((a, b) => {
      for (let i = 0; i < a.values.length; i++) {
        const order = a.values[i], other = b.values[i]
        const direction = plain(order.direction) ? order.direction.sort : order.direction
        if ((order.value == null) !== (other.value == null)) {
          const nulls = plain(order.direction) ? order.direction.nulls : undefined
          const first = nulls === 'first' || (nulls === undefined && direction === 'desc')
          return (order.value == null ? -1 : 1) * (first ? 1 : -1)
        }
        const result = compare(order.value, other.value)
        if (result) return direction === 'desc' ? -result : result
      }
      return 0
    })
    return keyed.map(item => item.row)
  }
  async selected(model: Model, rows: Row[], args: Row): Promise<Row[]> {
    let result = (await Promise.all(rows.map(async row => await this.matches(model, row, args.where) ? row : null))).filter((row): row is Row => row !== null)
    result = await this.ordered(model, result, args.orderBy)
    if (args.distinct) {
      const keys = Array.isArray(args.distinct) ? args.distinct : [args.distinct]
      const seen = new Set<string>()
      result = result.filter(row => { const key = JSON.stringify(keys.map(field => row[String(field)])); if (seen.has(key)) return false; seen.add(key); return true })
    }
    if (args.cursor) {
      const position = (await Promise.all(result.map(row => this.matches(model, row, args.cursor)))).indexOf(true)
      result = position < 0 ? [] : result.slice(position)
    }
    if (args.skip) result = result.slice(Number(args.skip))
    if (typeof args.take === 'number') {
      if (args.take < 0) throw new Error('Negative pagination is unsupported')
      result = result.slice(0, args.take)
    }
    return result
  }
  async project(model: Model, row: Row, args: Row): Promise<Row> {
    const output: Row = args.select ? {} : { ...row }
    for (const [name, selection] of Object.entries(record(args.select ?? args.include ?? {}))) {
      if (!selection) continue
      if (name === '_count') {
        const counts: Row = {}
        const fields = selection === true ? Object.fromEntries(model.fields.filter(field => field.isList && field.kind === 'object').map(field => [field.name, true])) : record(record(selection).select)
        for (const [key, config] of Object.entries(fields)) {
          if (!config) continue
          const field = model.fields.find(item => item.name === key)
          if (!field || field.kind !== 'object') throw new Error('Unsupported relation count')
          const rows = await this.related(model, row, field)
          counts[key] = (await this.selected(modelByName.get(field.type)!, rows, config === true ? {} : record(config))).length
        }
        output._count = counts
      } else {
        const field = model.fields.find(item => item.name === name)
        if (!field) throw new Error(`Unknown selected field: ${name}`)
        if (field.kind !== 'object') output[name] = row[name]
        else {
          const target = modelByName.get(field.type)!
          const options = selection === true ? {} : record(selection)
          const related = await this.selected(target, await this.related(model, row, field), options)
          const projected = await Promise.all(related.map(item => this.project(target, item, options)))
          output[name] = field.isList ? projected : projected[0] ?? null
        }
      }
    }
    if (args.omit) for (const [name, omit] of Object.entries(record(args.omit))) if (omit) delete output[name]
    return output
  }
  aggregate(rows: Row[], args: Row): Row {
    const output: Row = {}
    for (const operator of ['_count', '_sum', '_avg', '_min', '_max']) {
      const config = args[operator]
      if (!config) continue
      if (operator === '_count' && config === true) { output._count = rows.length; continue }
      const fields: Row = {}
      for (const [name, enabled] of Object.entries(record(config))) {
        if (!enabled) continue
        const values = rows.map(row => row[name]).filter(value => value !== null && value !== undefined)
        if (operator === '_count') fields[name] = name === '_all' ? rows.length : values.length
        else if (!values.length) fields[name] = null
        else if (operator === '_min' || operator === '_max') fields[name] = values.reduce((a, b) => compare(a, b) * (operator === '_max' ? 1 : -1) > 0 ? a : b)
        else {
          const decimal = values.some(value => value instanceof Prisma.Decimal)
          const total = values.reduce<Prisma.Decimal>((sum, value) => sum.add(String(value)), new Prisma.Decimal(0))
          const result = operator === '_avg' ? total.div(values.length) : total
          fields[name] = decimal ? result : result.toNumber()
        }
      }
      output[operator] = fields
    }
    return output
  }
  async save(model: Model, data: Row, previous?: Row): Promise<Row> {
    const output: Row = previous ? { ...previous } : {}
    const nested: [Field, unknown][] = []
    for (const key of Object.keys(data)) if (!model.fields.some(field => field.name === key)) throw new Error(`Unknown write field: ${model.name}.${key}`)
    for (const field of model.fields) {
      if (field.kind === 'object') { if (data[field.name] !== undefined) nested.push([field, data[field.name]]); continue }
      let value = data[field.name]
      if (value === undefined) {
        if (field.isUpdatedAt) value = new Date()
        else if (previous) continue
        else if (field.hasDefaultValue) value = defaultValue(field)
        else if (!field.isRequired) value = null
        else if (field.isList) value = []
        else throw new Error(`Required field: ${model.name}.${field.name}`)
      } else if (value !== Prisma.DbNull && value !== Prisma.JsonNull && plain(value) && field.type !== 'Json') {
        const operation = Object.entries(value)
        if (operation.length !== 1) throw new Error('Invalid update operator')
        const [operator, amount] = operation[0]
        if (operator === 'set') value = amount
        else if (operator === 'increment' || operator === 'decrement') {
          const old = output[field.name]
          value = field.type === 'Decimal' ? new Prisma.Decimal(String(old)).add(new Prisma.Decimal(String(amount)).mul(operator === 'increment' ? 1 : -1)) : Number(old) + Number(amount) * (operator === 'increment' ? 1 : -1)
        } else if (operator === 'push' && Array.isArray(output[field.name])) value = [...output[field.name] as unknown[], ...Array.isArray(amount) ? amount : [amount]]
        else throw new Error(`Unsupported update: ${operator}`)
      }
      output[field.name] = normalize(field, value)
    }
    for (const [field, configuration] of nested) {
      const input = record(configuration)
      if ('connect' in input && field.relationFromFields?.length) {
        const target = modelByName.get(field.type)!
        const connected = (await this.selected(target, await this.rows(target), { where: input.connect }))[0]
        if (!connected) error('P2025', 'Relation target not found')
        field.relationFromFields.forEach((name, index) => { output[name] = connected[field.relationToFields![index]] })
      } else if (!('create' in input)) throw new Error('Unsupported nested mutation')
    }
    for (const unique of model.uniques) {
      if (unique.some(key => output[key] === null)) continue
      const existing = await this.rows(model, Object.fromEntries(unique.map(key => [key, output[key]])))
      if (existing.some(row => row.id !== output.id && unique.every(key => equal(row[key], output[key])))) error('P2002', 'Unique constraint failed', { target: unique })
    }
    for (const field of model.fields.filter(field => field.kind === 'object' && field.relationFromFields?.length)) {
      if (field.relationFromFields!.some(name => output[name] === null)) continue
      const target = modelByName.get(field.type)!
      if (!(await this.rows(target, Object.fromEntries(field.relationToFields!.map((name, index) => [name, output[field.relationFromFields![index]]])))).length) error('P2003', 'Foreign key constraint failed', { field_name: field.name })
    }
    encode(model, output)
    this.stage(model, output, String(output.id))
    for (const [field, configuration] of nested) {
      const input = record(configuration)
      if (!('create' in input)) continue
      const relation = relationTarget(model, field)
      if (field.relationFromFields?.length) throw new Error('Nested parent creation requires an explicit transaction')
      for (const child of Array.isArray(input.create) ? input.create : [input.create]) {
        const data = { ...record(child) }
        relation.to.forEach((name, index) => { data[name] = output[relation.from[index]] })
        await this.save(relation.model, data)
      }
    }
    return output
  }
  async remove(model: Model, row: Row, seen = new Set<string>()): Promise<void> {
    const key = `${model.name}:${row.id}`
    if (seen.has(key)) return
    seen.add(key)
    for (const dependent of models) for (const field of dependent.fields.filter(field => field.kind === 'object' && field.type === model.name && field.relationFromFields?.length)) {
      const related = await this.rows(dependent, Object.fromEntries(field.relationFromFields!.map((name, index) => [name, row[field.relationToFields![index]]])))
      for (const item of related) {
        const behavior = field.relationOnDelete ?? (field.isRequired ? 'Restrict' : 'SetNull')
        if (behavior === 'Cascade') await this.remove(dependent, item, seen)
        else if (behavior === 'SetNull') await this.save(dependent, { ...Object.fromEntries(field.relationFromFields!.map(name => [name, null])), ...Object.fromEntries(dependent.fields.filter(field => field.isUpdatedAt).map(field => [field.name, item[field.name]])) }, item)
        else error('P2003', 'Delete restricted by an existing relation')
      }
    }
    this.stage(model, null, String(row.id))
  }
  async execute(model: Model, method: string, args: Row): Promise<unknown> {
    if (!readMethods.has(method) && !writeMethods.has(method)) throw new Error(`Unsupported Legal data operation: ${method}`)
    const found = method === 'create' || method === 'createMany' ? [] : await this.selected(model, await this.rows(model, equalityPlan(model, args.where)), method === 'groupBy' ? { where: args.where } : args)
    if (method === 'findMany') return Promise.all(found.map(row => this.project(model, row, args)))
    if (['findUnique', 'findFirst', 'findUniqueOrThrow', 'findFirstOrThrow'].includes(method)) {
      if (!found[0] && method.endsWith('OrThrow')) error('P2025', 'Record not found')
      return found[0] ? this.project(model, found[0], args) : null
    }
    if (method === 'count') return args.select ? this.aggregate(found, { _count: args.select })._count : found.length
    if (method === 'aggregate') return this.aggregate(found, args)
    if (method === 'groupBy') {
      if (args.having) throw new Error('Group having requires an explicit query plan')
      const by = args.by as string[]
      const groups = new Map<string, Row[]>()
      for (const row of found) { const key = JSON.stringify(by.map(field => row[field])); groups.set(key, [...groups.get(key) ?? [], row]) }
      const results = [...groups.values()].map(rows => ({ ...Object.fromEntries(by.map(key => [key, rows[0][key]])), ...this.aggregate(rows, args) }))
      return this.selected(model, results, { orderBy: args.orderBy, skip: args.skip, take: args.take })
    }
    if (method === 'create') return this.project(model, await this.save(model, record(args.data)), args)
    if (method === 'createMany') {
      let count = 0
      for (const data of Array.isArray(args.data) ? args.data : [args.data]) {
        try { await this.save(model, record(data)); count++ }
        catch (cause) { if (!(args.skipDuplicates && cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002')) throw cause }
      }
      return { count }
    }
    if (method === 'upsert') return this.project(model, await this.save(model, record(found[0] ? args.update : args.create), found[0]), args)
    if (!found.length && (method === 'update' || method === 'delete')) error('P2025', 'Record not found')
    const targets = method.endsWith('Many') ? found : found.slice(0, 1)
    const results: Row[] = []
    for (const row of targets) {
      if (method.startsWith('delete')) { await this.remove(model, row); results.push(row) }
      else results.push(await this.save(model, record(args.data), row))
    }
    return method.endsWith('Many') ? { count: results.length } : this.project(model, results[0], args)
  }
  async commit() {
    if (!this.transaction && this.changes.size) throw new Error('Writes require a Firestore transaction')
    const packed = new Map<string, Row>()
    for (const [name, changes] of this.changes) for (const [id, row] of changes) if (row) {
      const data = encode(modelByName.get(name)!, row)
      if (!this.payloads && Buffer.byteLength(JSON.stringify(data)) > 900_000) throw new Error('Oversized legal records require the configured payload store')
      packed.set(`${name}:${id}`, this.payloads ? await this.payloads.pack(data) : data)
    }
    const writes = [...this.changes.values()].reduce((count, rows) => count + rows.size, this.changes.size)
    const bytes = [...packed.values()].reduce((size, row) => size + Buffer.byteLength(JSON.stringify(row)), 0)
    if (writes > 450 || bytes > 8 * 1024 * 1024) throw new Error('Legal transaction exceeds its atomic Firestore write limit')
    for (const [name, changes] of this.changes) {
      this.transaction!.set(this.db.doc(`legal_epochs/${name}`), { revision: randomUUID() })
      const model = modelByName.get(name)!
      for (const [id, row] of changes) {
        const ref = this.db.collection(name).doc(id)
        if (row) this.transaction!.set(ref, packed.get(`${model.name}:${id}`)!); else this.transaction!.delete(ref)
      }
    }
  }
}

/** Lazy operations allow the existing array transaction form to remain atomic. */
class Operation implements PromiseLike<unknown> {
  private promise?: Promise<unknown>
  constructor(readonly run: (context: Context) => Promise<unknown>, readonly start: () => Promise<unknown>) {}
  then<TResult1 = unknown, TResult2 = never>(onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    this.promise ??= this.start()
    return this.promise.then(onfulfilled, onrejected)
  }
  catch(onrejected: (reason: unknown) => unknown) { this.promise ??= this.start(); return this.promise.catch(onrejected) }
  finally(callback: () => void) { this.promise ??= this.start(); return this.promise.finally(callback) }
  get started() { return this.promise !== undefined }
}
export function createFirestoreClient(db = legalFirestore(), payloads = process.env.LEGAL_FIRESTORE_PAYLOAD_BUCKET ? new PayloadStore(process.env.LEGAL_FIRESTORE_PAYLOAD_BUCKET) : undefined): PrismaClient {
  async function transaction(work: unknown): Promise<unknown> {
    return db.runTransaction(async tx => {
      const context = new Context(db, tx, payloads)
      let result: unknown
      if (typeof work === 'function') result = await work(facade(context))
      else if (Array.isArray(work)) {
        const output: unknown[] = []
        for (const item of work) {
          if (!(item instanceof Operation) || item.started) throw new Error('A transaction requires unstarted Legal data operations')
          output.push(await item.run(context))
        }
        result = output
      } else throw new Error('Invalid transaction')
      await context.commit()
      return result
    })
  }
  function facade(context?: Context): object {
    return new Proxy({}, { get(target, key) {
      if (Reflect.has(target, key)) return Reflect.get(target, key)
      if (key === '$transaction') { if (context) throw new Error('Nested transactions are unsupported'); return transaction }
      if (key === '$disconnect' || key === '$connect') return async () => {}
      if (typeof key !== 'string') return undefined
      const model = modelByDelegate.get(key)
      if (!model) throw new Error(`Unsupported Legal data client member: ${key}`)
      return new Proxy({}, { get(_delegate, method) {
        if (typeof method !== 'string') return undefined
        return (value: unknown = {}) => {
          const args = record(value)
          const run = (context: Context) => context.execute(model, method, args)
          return new Operation(run, () => context ? run(context) : readMethods.has(method) ? run(new Context(db, undefined, payloads)) : transaction((client: Record<string, Record<string, (args: Row) => Promise<unknown>>>) => client[key][method](args)))
        }
      } })
    } })
  }
  // One audited boundary retains generated model and action types while replacing the transport.
  return facade() as PrismaClient
}
