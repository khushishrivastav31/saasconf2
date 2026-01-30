import { useContext } from "react";
import { ApplicantAuthContext } from "../contexts/ApplicantAuthContext";

export function useApplicantAuth() {
  const context = useContext(ApplicantAuthContext);

  if (!context) {
    throw new Error(
      "useApplicantAuth must be used within an ApplicantAuthProvider",
    );
  }

  return context;
}
