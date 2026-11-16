import { inject } from 'vue'

export const portalKey = Symbol('enterprise-portal')
export const usePortal = () => inject(portalKey)
