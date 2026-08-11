export type LoginMode = 'client' | 'admin'

export interface LoginModeTransition {
  loginMode: LoginMode
  password: ''
  errorMessage: undefined
}


export function selectLoginMode(mode: LoginMode): LoginMode {
  return mode
}

export function createLoginModeTransition(
  loginMode: LoginMode,
): LoginModeTransition {
  return {
    loginMode,
    password: '',
    errorMessage: undefined,
  }
}
