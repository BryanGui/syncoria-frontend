import type { CompanyInput, ContactInput } from './model'

export interface Field<T> {
  key: keyof T & string
  label: string
  required?: boolean
  max: number
  type?: 'url' | 'email' | 'tel' | 'notes' | 'status'
}
export const companyFields: Field<CompanyInput>[] = [
  { key: 'name', label: 'Nom de l’entreprise', required: true, max: 200 },
  { key: 'website', label: 'Site web', type: 'url', max: 2048 },
  { key: 'city', label: 'Ville', max: 200 },
  { key: 'sector', label: 'Secteur', max: 200 },
  {
    key: 'status',
    label: 'Statut commercial',
    type: 'status',
    required: true,
    max: 20,
  },
  { key: 'source', label: 'Source', max: 200 },
  { key: 'notes', label: 'Notes', type: 'notes', max: 4000 },
]
export const contactFields: Field<ContactInput>[] = [
  { key: 'first_name', label: 'Prénom', required: true, max: 200 },
  { key: 'last_name', label: 'Nom', required: true, max: 200 },
  { key: 'role', label: 'Fonction', max: 200 },
  { key: 'email', label: 'Email', type: 'email', max: 320 },
  { key: 'phone', label: 'Téléphone', type: 'tel', max: 64 },
  { key: 'linkedin_url', label: 'URL LinkedIn', type: 'url', max: 2048 },
  { key: 'notes', label: 'Notes', type: 'notes', max: 4000 },
]
export const emptyCompany: CompanyInput = {
  name: '',
  website: null,
  city: null,
  sector: null,
  status: 'identified',
  source: null,
  notes: null,
}
export const emptyContact: ContactInput = {
  first_name: '',
  last_name: '',
  role: null,
  email: null,
  phone: null,
  linkedin_url: null,
  notes: null,
}
