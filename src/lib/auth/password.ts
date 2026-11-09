import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTS)
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hashValue, plain)
  } catch {
    return false
  }
}
