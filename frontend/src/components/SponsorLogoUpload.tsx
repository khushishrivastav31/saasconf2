import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../config/api";
import type { Attachment } from "../types";

interface SponsorLogoUploadProps {
  sponsorId: string;
}

export default function SponsorLogoUpload({ sponsorId }: SponsorLogoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"idle" | "uploading" | "deleting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [logoBlobUrl, setLogoBlobUrl] = useState<string | null>(null);

  const { data: logoData, isLoading } = useQuery({
    queryKey: ["attachments", "sponsor_logo", sponsorId],
    queryFn: async () => {
      const response = await api.get<{ items: Attachment[]; total: number }>(
        `/attachments?entity_type=sponsor_logo&entity_id=${sponsorId}`
      );
      return response.data;
    },
  });

  const logo = logoData?.items?.[0];

  // Fetch the logo image as a blob and create an object URL
  useEffect(() => {
    if (!logo) {
      setLogoBlobUrl(null);
      return;
    }

    let objectUrl: string | null = null;

    const fetchLogo = async () => {
      try {
        const response = await api.get(`/attachments/${logo.id}/download`, {
          responseType: "blob",
        });
        objectUrl = URL.createObjectURL(response.data);
        setLogoBlobUrl(objectUrl);
      } catch {
        setLogoBlobUrl(null);
      }
    };

    fetchLogo();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [logo?.id]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // If there's an existing logo, delete it first
      if (logo) {
        await api.delete(`/attachments/${logo.id}`);
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity_type", "sponsor_logo");
      formData.append("entity_id", sponsorId);
      const response = await api.post<Attachment>("/attachments", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    },
    onMutate: () => {
      setStatus("uploading");
      setError(null);
    },
    onSuccess: () => {
      setStatus("idle");
      queryClient.invalidateQueries({
        queryKey: ["attachments", "sponsor_logo", sponsorId],
      });
    },
    onError: () => {
      setStatus("error");
      setError("Upload failed. Please try again.");
      setTimeout(() => setStatus("idle"), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (logo) {
        await api.delete(`/attachments/${logo.id}`);
      }
    },
    onMutate: () => {
      setStatus("deleting");
      setError(null);
    },
    onSuccess: () => {
      setStatus("idle");
      queryClient.invalidateQueries({
        queryKey: ["attachments", "sponsor_logo", sponsorId],
      });
    },
    onError: () => {
      setStatus("error");
      setError("Delete failed. Please try again.");
      setTimeout(() => setStatus("idle"), 3000);
    },
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="border-b pb-4">
      <h5 className="text-sm font-medium text-gray-700 mb-3">Logo</h5>
      <div className="flex items-start gap-4">
        {/* Logo preview */}
        <div className="min-w-24 max-w-48 h-24 border border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center p-2">
          {isLoading ? (
            <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : logoBlobUrl ? (
            <img
              src={logoBlobUrl}
              alt="Sponsor logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <svg className="h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
        </div>

        {/* Upload controls */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            onChange={handleLogoUpload}
            className="hidden"
            id={`sponsor-logo-upload-${sponsorId}`}
          />
          <label
            htmlFor={`sponsor-logo-upload-${sponsorId}`}
            className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
              status === "uploading"
                ? "bg-gray-100 text-gray-400 cursor-wait"
                : "bg-primary-600 text-white hover:bg-primary-700"
            }`}
          >
            {status === "uploading" ? (
              <>
                <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {logo ? "Replace Logo" : "Upload Logo"}
              </>
            )}
          </label>

          {logo && (
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={status === "deleting"}
              className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md ${
                status === "deleting"
                  ? "bg-gray-100 text-gray-400 cursor-wait"
                  : "bg-white text-red-600 border border-red-300 hover:bg-red-50"
              }`}
            >
              {status === "deleting" ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Deleting...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Logo
                </>
              )}
            </button>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <p className="text-xs text-gray-500">
            JPEG, PNG, WebP, GIF, or SVG. Max 10MB.
          </p>
        </div>
      </div>
    </div>
  );
}
