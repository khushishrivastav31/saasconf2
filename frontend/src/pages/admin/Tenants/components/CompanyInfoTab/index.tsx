import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import UnsavedChangesDialog from '../../../../../components/UnsavedChangesDialog';
import { useUnsavedChanges } from '../../../../../hooks/useUnsavedChanges';
import { zResolver } from '../../../../../lib/forms';
import type { Tenant, ContactPerson } from '../../../../../types';
import {
  companyFormSchema,
  formDataToUpdate,
  tenantToFormData,
  type CompanyFormData,
} from './schema';
import { useTenantMutations } from './useTenantMutations';
import CompanyHeader from './CompanyHeader';
import LogoSection from './LogoSection';
import BasicInfoFields from './BasicInfoFields';
import PortalUrlSection from './PortalUrlSection';
import AddressFields from './AddressFields';
import ContactPersonsSection from './ContactPersonsSection';
import CommentsField from './CommentsField';
import CompanyStatusSection from './CompanyStatusSection';
import DangerZone from './DangerZone';

interface Props {
  tenant: Tenant;
  onUpdate: () => void;
  onClose: () => void;
}

export default function CompanyInfoTab({ tenant, onUpdate, onClose }: Props) {
  const {
    updateMutation,
    toggleActiveMutation,
    deleteMutation,
    uploadLogoMutation,
    deleteLogoMutation,
    logoStatus,
    logoError,
  } = useTenantMutations({ tenant, onUpdate, onClose });

  const methods = useForm<CompanyFormData>({
    resolver: zResolver(companyFormSchema),
    defaultValues: tenantToFormData(tenant),
    mode: 'onSubmit',
  });
  const {
    reset,
    handleSubmit,
    formState: { isDirty },
  } = methods;

  // Contact persons stay outside RHF — they save immediately per-op
  const [contacts, setContacts] = useState<ContactPerson[]>(tenant.contact_persons || []);

  useEffect(() => {
    reset(tenantToFormData(tenant));
    setContacts(tenant.contact_persons || []);
  }, [tenant, reset]);

  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges(isDirty);

  const onSaveValid = (data: CompanyFormData) => {
    updateMutation.mutate(formDataToUpdate(data), {
      onSuccess: () => reset(data),
    });
  };

  const handleDiscard = () => reset(tenantToFormData(tenant));

  const saveContacts = (next: ContactPerson[]) => {
    setContacts(next);
    updateMutation.mutate({
      ...formDataToUpdate(methods.getValues()),
      contact_persons: next,
    });
  };

  const portalUrl = `${window.location.origin}/${tenant.slug}/portal/user/login`;

  return (
    <FormProvider {...methods}>
      <div>
        <CompanyHeader
          isDirty={isDirty}
          isSaving={updateMutation.isPending}
          onDiscard={handleDiscard}
          onSave={handleSubmit(onSaveValid)}
        />

        <div className="space-y-4">
          <LogoSection
            tenant={tenant}
            logoStatus={logoStatus}
            logoError={logoError}
            onUpload={(file) => uploadLogoMutation.mutate(file)}
            onDelete={() => deleteLogoMutation.mutate()}
          />

          <BasicInfoFields />

          <PortalUrlSection portalUrl={portalUrl} />

          <AddressFields />

          <ContactPersonsSection
            contacts={contacts}
            onAdd={(c) => saveContacts([...contacts, c])}
            onUpdate={(index, c) => saveContacts(contacts.map((x, i) => (i === index ? c : x)))}
            onRemove={(index) => saveContacts(contacts.filter((_, i) => i !== index))}
          />

          <CommentsField />

          <CompanyStatusSection
            tenant={tenant}
            isToggling={toggleActiveMutation.isPending}
            onToggle={() => toggleActiveMutation.mutate()}
          />

          <DangerZone
            tenant={tenant}
            isDeleting={deleteMutation.isPending}
            onDelete={() => deleteMutation.mutate()}
          />
        </div>

        <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
      </div>
    </FormProvider>
  );
}
