import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../../config/api";
import { useIsAdmin } from "../../../hooks/useIsAdmin";
import { validatePhone } from "../../../utils/validators";
import type {
  Conference,
  Sponsor,
  SponsorCreate,
  SponsorUpdate,
  SponsorPackage,
  PlatformCurrency,
  LocationContactPerson,
  PaginatedResponse,
} from "../../../types";
import { parseApiError } from "../../../utils/apiError";
import SponsorDetailPanel from "../../../components/SponsorDetailPanel";
import ConfirmDialog from "../../../components/ConfirmDialog";
import RichTextEditor from "../../../components/common/RichTextEditor";
import ContactPersonList from "../../../components/ContactPersonList";
import { ErrorBanner } from "../../../components/common/ErrorBanner";
import { LoadingSpinner } from "../../../components/common/LoadingSpinner";
import { ChevronLeftIcon, EditIcon, DeleteIcon } from "../icons";

function ConferenceSponsorsTab({
  conference,
  selectedSponsorId,
  setSelectedSponsorId,
}: {
  conference: Conference;
  selectedSponsorId: string | null;
  setSelectedSponsorId: (id: string | null) => void;
}) {
  const isAdmin = useIsAdmin();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sponsor | null>(null);

  const emptyCreateForm: SponsorCreate = {
    company_name: "",
    sponsor_package_id: undefined,
    price: undefined,
    currency: "",
    phone: "",
    website: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    vat_number: "",
    comments: "",
    contact_persons: [],
    is_active: true,
  };

  // Form state for create
  const [createForm, setCreateForm] = useState<SponsorCreate>(emptyCreateForm);
  const [createPhoneError, setCreatePhoneError] = useState<string | null>(null);
  const [createNewContact, setCreateNewContact] =
    useState<LocationContactPerson>({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      comment: "",
    });

  const { data, isLoading } = useQuery({
    queryKey: ["conference-sponsors", conference.id],
    queryFn: async () => {
      const response = await api.get<{
        items: Sponsor[];
        total: number;
      }>(`/conferences/${conference.id}/sponsors`);
      return response.data;
    },
  });

  // Sponsor packages for dropdowns
  const { data: sponsorPackagesData } = useQuery({
    queryKey: ["sponsor-packages", conference.id],
    queryFn: async () => {
      const response = await api.get<{
        items: SponsorPackage[];
        total: number;
      }>(`/conferences/${conference.id}/settings/sponsor-packages`);
      return response.data;
    },
  });

  // Platform currencies for dropdowns
  const { data: currenciesData } = useQuery({
    queryKey: ["platform-currencies"],
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<PlatformCurrency>>(
        "/admin/settings/currencies",
        { params: { page_size: 100, is_active: true } },
      );
      return response.data;
    },
  });

  const selectedSponsor = data?.items?.find(
    (s) => s.id === selectedSponsorId,
  );

  const createMutation = useMutation({
    mutationFn: async (sponsorData: SponsorCreate) => {
      const response = await api.post<Sponsor>(
        `/conferences/${conference.id}/sponsors`,
        sponsorData,
      );
      return response.data;
    },
    onSuccess: (newSponsor) => {
      queryClient.invalidateQueries({
        queryKey: ["conference-sponsors", conference.id],
      });
      setIsAdding(false);
      setCreateForm(emptyCreateForm);
      setCreatePhoneError(null);
      setCreateNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
      setError(null);
      setSelectedSponsorId(newSponsor.id);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to create sponsor"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data: sponsorData,
    }: {
      id: string;
      data: SponsorUpdate;
    }) => {
      const response = await api.put<Sponsor>(
        `/conferences/${conference.id}/sponsors/${id}`,
        sponsorData,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conference-sponsors", conference.id],
      });
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, "Failed to update sponsor"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/sponsors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["conference-sponsors", conference.id],
      });
      setSelectedSponsorId(null);
      setDeleteTarget(null);
    },
  });

  const handleCreatePackageChange = (packageId: string) => {
    if (!packageId) {
      setCreateForm({ ...createForm, sponsor_package_id: undefined });
      return;
    }
    const pkg = (sponsorPackagesData?.items || []).find(
      (p) => p.id === packageId,
    );
    if (pkg) {
      const updates: Partial<SponsorCreate> = { sponsor_package_id: pkg.id };
      if (!createForm.price && pkg.price != null) {
        updates.price = pkg.price;
      }
      if (!createForm.currency && pkg.currency) {
        updates.currency = pkg.currency;
      }
      setCreateForm({ ...createForm, ...updates });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createPhoneError) return;
    const finalData = { ...createForm };
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      finalData.contact_persons = [
        ...(finalData.contact_persons || []),
        { ...createNewContact },
      ];
    }
    createMutation.mutate(finalData);
  };

  const addCreateContact = () => {
    if (createNewContact.first_name.trim() && createNewContact.last_name.trim()) {
      setCreateForm({
        ...createForm,
        contact_persons: [
          ...(createForm.contact_persons || []),
          { ...createNewContact },
        ],
      });
      setCreateNewContact({ first_name: "", last_name: "", email: "", phone: "", comment: "" });
    }
  };

  const removeCreateContact = (index: number) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.filter((_, i) => i !== index) || [],
    });
  };

  const updateCreateContact = (
    index: number,
    contact: LocationContactPerson,
  ) => {
    setCreateForm({
      ...createForm,
      contact_persons:
        createForm.contact_persons?.map((c, i) =>
          i === index ? contact : c,
        ) || [],
    });
  };

  const sponsorCount = data?.items?.length || 0;

  return (
    <div>
      {/* === DETAIL PANEL VIEW === */}
      {selectedSponsor ? (
        <>
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setSelectedSponsorId(null)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronLeftIcon />
              Back to sponsors list
            </button>
          </div>

          <ErrorBanner message={error} />

          <SponsorDetailPanel
            sponsor={selectedSponsor}
            sponsorPackages={sponsorPackagesData?.items || []}
            currencies={currenciesData?.items || []}
            onSave={(sponsorData) =>
              updateMutation.mutate({
                id: selectedSponsor.id,
                data: sponsorData,
              })
            }
            onDelete={(id) => deleteMutation.mutate(id)}
            isSaving={updateMutation.isPending}
          />
        </>
      ) : (
        <>
          {/* === TABLE LIST VIEW === */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Sponsors
                {sponsorCount > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {sponsorCount}
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500">
                Manage sponsors for this conference.
              </p>
            </div>
            {isAdmin && !isAdding && (
              <button
                type="button"
                onClick={() => {
                  setIsAdding(true);
                  setError(null);
                }}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
              >
                + Add Sponsor
              </button>
            )}
          </div>

          <ErrorBanner message={error} />

          {/* Create form */}
          {isAdding && (
            <form
              onSubmit={handleCreateSubmit}
              className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-5 space-y-4"
            >
              <h5 className="text-sm font-medium text-gray-900">
                New Sponsor
              </h5>

              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={createForm.company_name}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      company_name: e.target.value,
                    })
                  }
                />
              </div>

              {/* Package + Active */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sponsor Package
                  </label>
                  <select
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.sponsor_package_id || ""}
                    onChange={(e) => handleCreatePackageChange(e.target.value)}
                  >
                    <option value="">-- No Package --</option>
                    {(sponsorPackagesData?.items || []).map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createForm.is_active ?? true}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          is_active: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Active
                    </span>
                  </label>
                </div>
              </div>

              {/* Price + Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.price ?? ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        price: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <select
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.currency || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        currency: e.target.value,
                      })
                    }
                  >
                    <option value="">-- Select Currency --</option>
                    {(currenciesData?.items || []).map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} - {c.name} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Phone + Website */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    className={`block w-full border rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 ${createPhoneError ? "border-red-300" : "border-gray-300"}`}
                    value={createForm.phone || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCreateForm({
                        ...createForm,
                        phone: value,
                      });
                      setCreatePhoneError(validatePhone(value));
                    }}
                    placeholder="+491234545 or 00491234566"
                  />
                  {createPhoneError && <p className="mt-1 text-xs text-red-600">{createPhoneError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    placeholder="https://"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.website || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        website: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* Address */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.address_line1 || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        address_line1: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.address_line2 || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        address_line2: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* City, State, Postal Code, Country */}
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.city || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        city: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.state || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        state: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.postal_code || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        postal_code: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    value={createForm.country || ""}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        country: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* VAT Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  VAT Number
                </label>
                <input
                  type="text"
                  placeholder="e.g., DE123456789"
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  value={createForm.vat_number || ""}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      vat_number: e.target.value,
                    })
                  }
                />
              </div>

              {/* Comments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comments
                </label>
                <RichTextEditor
                  value={createForm.comments || ""}
                  onChange={(html) =>
                    setCreateForm({
                      ...createForm,
                      comments: html,
                    })
                  }
                  rows={2}
                />
              </div>

              {/* Contact Persons */}
              <ContactPersonList
                contacts={createForm.contact_persons || []}
                newContact={createNewContact}
                setNewContact={setCreateNewContact}
                addContact={addCreateContact}
                removeContact={removeCreateContact}
                updateContact={updateCreateContact}
              />

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={createMutation.isPending || !!createPhoneError}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    setError(null);
                    setCreateForm(emptyCreateForm);
                    setCreatePhoneError(null);
                    setCreateNewContact({
                      first_name: "",
                      last_name: "",
                      email: "",
                      phone: "",
                      comment: "",
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Sponsors table */}
          {isLoading ? (
            <LoadingSpinner />
          ) : data?.items && data.items.length > 0 ? (
            <div className="overflow-hidden border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Package
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      City
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Active
                    </th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.items.map((sponsor) => (
                    <tr key={sponsor.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {sponsor.company_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {sponsor.sponsor_package_name || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {sponsor.price != null
                          ? `${sponsor.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${sponsor.currency ? ` ${sponsor.currency}` : ""}`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {sponsor.city || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            sponsor.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {sponsor.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedSponsorId(sponsor.id)}
                              className="text-gray-400 hover:text-primary-600 p-1 rounded transition-colors"
                              title="Edit"
                            >
                              <EditIcon />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(sponsor)}
                              disabled={deleteMutation.isPending}
                              className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <DeleteIcon />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !isAdding && (
              <div className="text-center py-6 text-sm text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                No sponsors yet. Click "+ Add Sponsor" to get started.
              </div>
            )
          )}
        </>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Sponsor"
        message={`Are you sure you want to delete "${deleteTarget?.company_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default ConferenceSponsorsTab;
