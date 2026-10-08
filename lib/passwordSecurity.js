import 'server-only'

export async function passwordPolicyCode(password){
  return String(password||'').length < 8 ? 'weak_password' : null
}
