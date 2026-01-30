import { useState } from "react";
import Modal from "./Modal";
import RichTextEditor from "./common/RichTextEditor";
import type { ConferenceCreate } from "../types";

interface CreateConferenceModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ConferenceCreate) => void;
  isLoading: boolean;
  error: string | null;
}

export default function CreateConferenceModal({
  open,
  onClose,
  onSubmit,
  isLoading,
  error,
}: CreateConferenceModalProps) {
  const [formData, setFormData] = useState<ConferenceCreate>({
    name: "",
    abbreviation: "",
    description: "",
    website: "",
    start_date: "",
    end_date: "",
    venue_name: "",
    city: "",
    country: "",
    venue_type: "onsite",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Clean up empty strings
    const cleanData: ConferenceCreate = {
      name: formData.name,
    };
    if (formData.abbreviation) cleanData.abbreviation = formData.abbreviation;
    if (formData.description) cleanData.description = formData.description;
    if (formData.website) cleanData.website = formData.website;
    if (formData.start_date) cleanData.start_date = formData.start_date;
    if (formData.end_date) cleanData.end_date = formData.end_date;
    if (formData.venue_name) cleanData.venue_name = formData.venue_name;
    if (formData.city) cleanData.city = formData.city;
    if (formData.country) cleanData.country = formData.country;
    cleanData.venue_type = formData.venue_type;

    onSubmit(cleanData);
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Conference">
      <form onSubmit={handleSubmit}>
        <div className="px-6 py-4 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700">
                Conference Name *
              </label>
              <input
                type="text"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700">
                Abbreviation
              </label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                placeholder="e.g., ICML 2026"
                value={formData.abbreviation}
                onChange={(e) =>
                  setFormData({ ...formData, abbreviation: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <RichTextEditor
              value={formData.description}
              onChange={(html) =>
                setFormData({ ...formData, description: html })
              }
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Website
            </label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              placeholder="www.conference.com"
              value={formData.website}
              onChange={(e) =>
                setFormData({ ...formData, website: e.target.value })
              }
            />
          </div>

          {/* Dates */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              Conference Dates
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Start Date
                </label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  End Date
                </label>
                <input
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Location</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Venue Name
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.venue_name}
                  onChange={(e) =>
                    setFormData({ ...formData, venue_name: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    City
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Country
                  </label>
                  <input
                    type="text"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    value={formData.country}
                    onChange={(e) =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Venue Type
                </label>
                <select
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  value={formData.venue_type}
                  onChange={(e) =>
                    setFormData({ ...formData, venue_type: e.target.value as "onsite" | "virtual" | "hybrid" })
                  }
                >
                  <option value="onsite">Onsite</option>
                  <option value="virtual">Virtual</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 rounded-b-lg">
          {error && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {isLoading ? "Creating..." : "Create Conference"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
