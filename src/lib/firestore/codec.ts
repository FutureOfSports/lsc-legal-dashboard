/** Legal values cross Firestore as exact decimals, UTC dates and JSON, never float money. */
import { Prisma } from '@/generated/prisma/client'
import manifest from './schema.json'

export type Row = Record<string, unknown>
export interface Field {
  name: string; kind: string; type: string; isList: boolean; isRequired: boolean;
  isId: boolean; isUpdatedAt?: boolean; hasDefaultValue: boolean; default?: unknown;
  nativeType?: unknown; relationName?: string; relationFromFields?: string[];
  relationToFields?: string[]; relationOnDelete?: string;
}
export interface Model { name: string; delegate: string; fields: Field[]; uniques: string[][] }
export const models: Model[] = manifest.models
export const schemaHash = manifest.hash
export const modelByName = new Map(models.map(model => [model.name, model]))
export const modelByDelegate = new Map(models.map(model => [model.delegate, model]))

export function record(value: unknown): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Row
}
export function plain(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && !(value instanceof Date) && !(value instanceof Prisma.Decimal)
}
export function normalize(field: Field, value: unknown): unknown {
  if (value === Prisma.DbNull || value === Prisma.JsonNull || value === Prisma.AnyNull) return null
  if (value === null) {
    if (field.isRequired && field.type !== 'Json') throw new Error(`Required field: ${field.name}`)
    return null
  }
  if (field.isList) {
    if (!Array.isArray(value)) throw new Error(`Expected a list: ${field.name}`)
    return value.map(item => normalize({ ...field, isList: false }, item))
  }
  if (field.kind === 'enum') {
    const values = (manifest.enums as Record<string, string[]>)[field.type]
    if (typeof value !== 'string' || !values?.includes(value)) throw new Error(`Invalid enum: ${field.name}`)
    return value
  }
  if (field.type === 'Decimal') {
    if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Prisma.Decimal)) throw new Error(`Invalid decimal: ${field.name}`)
    let decimal = new Prisma.Decimal(value)
    if (!decimal.isFinite()) throw new Error(`Invalid decimal: ${field.name}`)
    const native = field.nativeType
    if (Array.isArray(native) && native[0] === 'Decimal' && Array.isArray(native[1])) {
      const [precision, scale] = native[1].map(Number)
      decimal = decimal.toDecimalPlaces(scale)
      if (decimal.abs().gte(new Prisma.Decimal(10).pow(precision - scale))) throw new Error(`Decimal overflow: ${field.name}`)
    }
    return decimal
  }
  if (field.type === 'DateTime') {
    const date = value instanceof Date ? new Date(value) : typeof value === 'string' ? new Date(value) : null
    if (!date || !Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${field.name}`)
    if (Array.isArray(field.nativeType) && field.nativeType[0] === 'Date') return new Date(date.toISOString().slice(0, 10) + 'T00:00:00Z')
    return date
  }
  if (field.type === 'Int' && (!Number.isSafeInteger(value))) throw new Error(`Invalid integer: ${field.name}`)
  if (field.type === 'Float' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`Invalid number: ${field.name}`)
  if (field.type === 'String' && typeof value !== 'string') throw new Error(`Invalid string: ${field.name}`)
  if (field.type === 'Boolean' && typeof value !== 'boolean') throw new Error(`Invalid boolean: ${field.name}`)
  if (field.type === 'Json') return JSON.parse(JSON.stringify(value)) as unknown
  return value
}
export function encode(model: Model, row: Row): Row {
  const output: Row = {}
  for (const field of model.fields.filter(field => field.kind !== 'object')) {
    const value = row[field.name]
    if (value === undefined) throw new Error(`Missing field: ${model.name}.${field.name}`)
    const normalized = normalize(field, value)
    output[field.name] = normalized instanceof Prisma.Decimal ? normalized.toFixed()
      : normalized instanceof Date ? normalized.toISOString() : normalized
  }
  return output
}
export function decode(model: Model, data: Row): Row {
  // PostgreSQL permits NULL legacy arrays; the existing Prisma client exposes them as empty lists.
  return Object.fromEntries(model.fields.filter(field => field.kind !== 'object').map(field => [field.name, normalize(field, field.isList && data[field.name] === null ? [] : data[field.name])]))
}
export function comparable(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null || value === Prisma.DbNull || value === Prisma.JsonNull || value === Prisma.AnyNull) return null
  if (value instanceof Date) return value.getTime()
  if (value instanceof Prisma.Decimal) return value.toFixed()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return JSON.stringify(value)
}
export function equal(left: unknown, right: unknown): boolean {
  if (left instanceof Prisma.Decimal || right instanceof Prisma.Decimal) {
    if (left == null || right == null) return left === right
    return new Prisma.Decimal(String(comparable(left))).eq(String(comparable(right)))
  }
  if (left instanceof Date && typeof right === 'string') return left.getTime() === new Date(right).getTime()
  return comparable(left) === comparable(right)
}
export function compare(left: unknown, right: unknown): number {
  if (left instanceof Date && typeof right === 'string') right = new Date(right)
  if (right instanceof Date && typeof left === 'string') left = new Date(left)
  if (equal(left, right)) return 0
  if (left == null) return 1
  if (right == null) return -1
  if (left instanceof Prisma.Decimal || right instanceof Prisma.Decimal) return new Prisma.Decimal(String(comparable(left))).cmp(String(comparable(right)))
  const a = comparable(left), b = comparable(right)
  return a! < b! ? -1 : 1
}
