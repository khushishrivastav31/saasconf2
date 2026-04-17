import { z } from 'zod';
import type { Tenant, TenantUpdate, ContactPerson } from '../../../../../types';

export const companyFormSchema = z.object({
  name: z.string(),
  address: z.string(),
  postal_code: z.string(),
  city: z.string(),
  country: z.string(),
  vat_number: z.string(),
  website: z.string(),
  email_domain: z.string(),
  comments: z.string(),
});

export type CompanyFormData = z.infer<typeof companyFormSchema>;

export const emptyCompanyForm: CompanyFormData = {
  name: '',
  address: '',
  postal_code: '',
  city: '',
  country: '',
  vat_number: '',
  website: '',
  email_domain: '',
  comments: '',
};

export function tenantToFormData(tenant: Tenant): CompanyFormData {
  return {
    name: tenant.name,
    address: tenant.address || '',
    postal_code: tenant.postal_code || '',
    city: tenant.city || '',
    country: tenant.country || '',
    vat_number: tenant.vat_number || '',
    website: tenant.website || '',
    email_domain: tenant.email_domain || '',
    comments: tenant.comments || '',
  };
}

export function formDataToUpdate(data: CompanyFormData): TenantUpdate {
  return {
    name: data.name,
    address: data.address,
    postal_code: data.postal_code,
    city: data.city,
    country: data.country,
    vat_number: data.vat_number,
    website: data.website,
    email_domain: data.email_domain,
    comments: data.comments,
  };
}

export const emptyContact: ContactPerson = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  role: '',
};
