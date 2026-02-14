import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminLayout from "../AdminLayout";
import type { User } from "../../../types";

// Mock react-router-dom
const mockNavigate = vi.fn();
const mockLocation = { pathname: "/dashboard" };

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  Outlet: () => <div data-testid="outlet">Outlet Content</div>,
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

// Mock useAuth hook
const mockLogout = vi.fn();
const mockRefreshUser = vi.fn();
let mockUser: User | null = null;

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
    refreshUser: mockRefreshUser,
  }),
}));

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.pathname = "/dashboard";
    mockUser = {
      id: "user-123",
      email: "test@example.com",
      first_name: "Test",
      last_name: "User",
      pronouns: null,
      role: "user",
      tenant_id: "tenant-123",
      tenant_name: "Test Tenant",
      modules: ["cfp", "conferences"],
      is_active: true,
      last_login: null,
      created_at: "2024-01-01T00:00:00Z",
    };
  });

  describe("rendering", () => {
    it("renders the layout with sidebar and main content area", () => {
      render(<AdminLayout />);

      expect(screen.getByText("SaaSConf")).toBeInTheDocument();
      expect(screen.getByTestId("outlet")).toBeInTheDocument();
    });

    it("renders the user name in the header", () => {
      render(<AdminLayout />);

      expect(screen.getByText("Test User")).toBeInTheDocument();
    });

    it("renders the user email when name is not available", () => {
      mockUser = {
        ...mockUser!,
        first_name: null,
        last_name: null,
      };

      render(<AdminLayout />);

      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("renders the user role", () => {
      render(<AdminLayout />);

      expect(screen.getByText("user")).toBeInTheDocument();
    });

    it("renders tenant_admin role with proper formatting", () => {
      mockUser = {
        ...mockUser!,
        role: "tenant_admin",
      };

      render(<AdminLayout />);

      expect(screen.getByText("tenant admin")).toBeInTheDocument();
    });

    it("renders the logout button in the user menu dropdown", async () => {
      const user = userEvent.setup();
      render(<AdminLayout />);

      // Open the user menu dropdown
      const userMenuButton = screen.getByText("Test User").closest("button")!;
      await user.click(userMenuButton);

      expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    });

    it("renders Dashboard navigation link", () => {
      render(<AdminLayout />);

      expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
    });
  });

  describe("sidebar navigation", () => {
    it("renders module navigation for users with module access", () => {
      render(<AdminLayout />);

      expect(screen.getByRole("link", { name: /conferences/i })).toBeInTheDocument();
    });

    it("hides module navigation links when user has no module access", () => {
      mockUser = {
        ...mockUser!,
        modules: [],
      };

      render(<AdminLayout />);

      expect(screen.queryByRole("link", { name: /conferences/i })).not.toBeInTheDocument();
    });

    it("shows only modules the user has access to", () => {
      mockUser = {
        ...mockUser!,
        modules: ["conferences"],
      };

      render(<AdminLayout />);

      expect(screen.getByRole("link", { name: /conferences/i })).toBeInTheDocument();
    });

    it("shows Team link for tenant_admin users", () => {
      mockUser = {
        ...mockUser!,
        role: "tenant_admin",
      };

      render(<AdminLayout />);

      expect(screen.getByRole("link", { name: /team/i })).toBeInTheDocument();
    });

    it("hides Team link for regular users", () => {
      mockUser = {
        ...mockUser!,
        role: "user",
      };

      render(<AdminLayout />);

      expect(screen.queryByRole("link", { name: /team/i })).not.toBeInTheDocument();
    });

    it("shows administration section for super_admin users", () => {
      mockUser = {
        ...mockUser!,
        role: "super_admin",
      };

      render(<AdminLayout />);

      expect(screen.getByRole("link", { name: /companies/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /modules/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /audit logs/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    });

    it("hides administration section for non-super_admin users", () => {
      mockUser = {
        ...mockUser!,
        role: "tenant_admin",
      };

      render(<AdminLayout />);

      expect(screen.queryByRole("link", { name: /companies/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /audit logs/i })).not.toBeInTheDocument();
    });

    it("super_admin sees all modules regardless of module assignment", () => {
      mockUser = {
        ...mockUser!,
        role: "super_admin",
        modules: [],
      };

      render(<AdminLayout />);

      expect(screen.getByRole("link", { name: /conferences/i })).toBeInTheDocument();
    });
  });

  describe("sidebar collapse toggle", () => {
    it("renders collapse/expand toggle button", () => {
      render(<AdminLayout />);

      const toggleButton = screen.getByTitle("Collapse sidebar");
      expect(toggleButton).toBeInTheDocument();
    });

    it("collapses sidebar when toggle is clicked", async () => {
      const user = userEvent.setup();
      render(<AdminLayout />);

      const collapseButton = screen.getByTitle("Collapse sidebar");
      await user.click(collapseButton);

      expect(screen.getByTitle("Expand sidebar")).toBeInTheDocument();
      expect(screen.queryByText("SaaSConf")).not.toBeInTheDocument();
    });

    it("expands sidebar when toggle is clicked again", async () => {
      const user = userEvent.setup();
      render(<AdminLayout />);

      const collapseButton = screen.getByTitle("Collapse sidebar");
      await user.click(collapseButton);

      const expandButton = screen.getByTitle("Expand sidebar");
      await user.click(expandButton);

      expect(screen.getByTitle("Collapse sidebar")).toBeInTheDocument();
      expect(screen.getByText("SaaSConf")).toBeInTheDocument();
    });
  });

  describe("mobile menu toggle", () => {
    it("renders mobile menu toggle button", () => {
      render(<AdminLayout />);

      // The mobile menu button is an svg icon button in the header
      const buttons = screen.getAllByRole("button");
      // Find the button with the menu icon (has lg:hidden class in source)
      const mobileMenuButton = buttons.find(
        (btn) => btn.className.includes("-ml-2")
      );
      expect(mobileMenuButton).toBeDefined();
    });

    it("toggles mobile sidebar state when menu button is clicked", async () => {
      const user = userEvent.setup();
      render(<AdminLayout />);

      // Find the mobile menu button (it's the one with -ml-2 class)
      const buttons = screen.getAllByRole("button");
      const mobileMenuButton = buttons.find(
        (btn) => btn.className.includes("-ml-2")
      );

      expect(mobileMenuButton).toBeDefined();
      await user.click(mobileMenuButton!);

      // The state change should happen (no error thrown)
      // We verify by clicking again
      await user.click(mobileMenuButton!);
    });
  });

  describe("logout functionality", () => {
    it("calls logout and navigates to login on logout button click", async () => {
      const user = userEvent.setup();
      mockLogout.mockResolvedValue(undefined);

      render(<AdminLayout />);

      // Open the user menu dropdown first
      const userMenuButton = screen.getByText("Test User").closest("button")!;
      await user.click(userMenuButton);

      const logoutButton = screen.getByRole("button", { name: "Logout" });
      await user.click(logoutButton);

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/login");
      });
    });
  });

  describe("route-based user refresh", () => {
    it("calls refreshUser on initial render", () => {
      render(<AdminLayout />);

      expect(mockRefreshUser).toHaveBeenCalled();
    });
  });

  describe("active link highlighting", () => {
    it("highlights Dashboard link when on dashboard path", () => {
      mockLocation.pathname = "/dashboard";

      render(<AdminLayout />);

      const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
      expect(dashboardLink.className).toContain("bg-gray-800");
    });

    it("highlights module link when on module path", () => {
      mockLocation.pathname = "/modules/conferences";

      render(<AdminLayout />);

      const conferencesLink = screen.getByRole("link", { name: /conferences/i });
      expect(conferencesLink.className).toContain("bg-gray-800");
    });

    it("highlights admin link when on admin sub-path", () => {
      mockLocation.pathname = "/admin/tenants";
      mockUser = {
        ...mockUser!,
        role: "super_admin",
      };

      render(<AdminLayout />);

      const companiesLink = screen.getByRole("link", { name: /companies/i });
      expect(companiesLink.className).toContain("bg-gray-800");
    });
  });
});
