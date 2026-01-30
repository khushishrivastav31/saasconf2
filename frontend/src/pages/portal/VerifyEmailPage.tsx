import { useEffect, useState } from "react";
import { useSearchParams, useParams, Link } from "react-router-dom";
import portalApi from "../../config/portalApi";
import { parseApiError } from "../../utils/apiError";

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { companySlug } = useParams<{ companySlug: string }>();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link.");
      return;
    }

    const verify = async () => {
      try {
        const res = await portalApi.post<{ message: string }>(
          `/portal/${companySlug}/verify-email`,
          { token },
        );
        setStatus("success");
        setMessage(res.data.message);
      } catch (err: unknown) {
        setStatus("error");
        setMessage(
          parseApiError(err, "Verification failed. The link may have expired."),
        );
      }
    };

    verify();
  }, [token, companySlug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full text-center">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {status === "verifying" && (
            <>
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Verifying your email...</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Email Verified
              </h2>
              <p className="text-sm text-gray-600 mb-6">{message}</p>
              <Link
                to={`/${companySlug}/portal/user/login`}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Go to Login
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Verification Failed
              </h2>
              <p className="text-sm text-gray-600">{message}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerifyEmailPage;
