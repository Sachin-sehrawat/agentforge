import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from '../src/components/AuthModal.jsx';
import { useAuth } from '../src/AuthContext.jsx';

vi.mock('../src/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

describe('AuthModal', () => {
  let mockLogin;
  let mockSignup;
  let mockOnClose;
  let mockOnSuccess;

  beforeEach(() => {
    mockLogin = vi.fn();
    mockSignup = vi.fn();
    mockOnClose = vi.fn();
    mockOnSuccess = vi.fn();
    useAuth.mockReturnValue({ login: mockLogin, signup: mockSignup });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderModal(props = {}) {
    return render(
      <AuthModal onClose={mockOnClose} onSuccess={mockOnSuccess} {...props} />
    );
  }

  function submitForm() {
    fireEvent.submit(document.querySelector('form'));
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('rendering', () => {
    it('shows sign in heading by default', () => {
      renderModal();
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeDefined();
    });

    it('shows email and password fields in login tab', () => {
      renderModal();
      expect(screen.getByLabelText(/email/i)).toBeDefined();
      expect(screen.getByLabelText(/password/i)).toBeDefined();
      expect(screen.queryByLabelText(/display name/i)).toBeNull();
    });

    it('shows create account heading when initialTab is signup', () => {
      renderModal({ initialTab: 'signup' });
      expect(screen.getByRole('heading', { name: /create account/i })).toBeDefined();
    });

    it('shows display name field only in signup tab', () => {
      renderModal({ initialTab: 'signup' });
      expect(screen.getByLabelText(/display name/i)).toBeDefined();
    });

    it('renders cancel and submit buttons', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
      expect(document.querySelector('button[type="submit"]')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Tab switching
  // ---------------------------------------------------------------------------

  describe('tab switching', () => {
    it('switches to signup tab when Sign up is clicked', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByRole('button', { name: /^sign up$/i }));
      expect(screen.getByRole('heading', { name: /create account/i })).toBeDefined();
      expect(screen.getByLabelText(/display name/i)).toBeDefined();
    });

    it('switches back to login tab from signup', async () => {
      const user = userEvent.setup();
      renderModal({ initialTab: 'signup' });
      await user.click(screen.getByRole('button', { name: /^sign in$/i }));
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeDefined();
      expect(screen.queryByLabelText(/display name/i)).toBeNull();
    });

    it('clears error message when switching tabs', async () => {
      const user = userEvent.setup();
      renderModal();
      submitForm(); // trigger "email required" error
      expect(screen.getByRole('alert')).toBeDefined();
      await user.click(screen.getByRole('button', { name: /^sign up$/i }));
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Client-side validation
  // ---------------------------------------------------------------------------

  describe('client-side validation', () => {
    it('shows error when email is empty on login submit', () => {
      renderModal();
      submitForm();
      expect(screen.getByText(/email is required/i)).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error for invalid email format', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText(/email/i), 'not-valid');
      submitForm();
      expect(screen.getByText(/valid email address/i)).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when password is empty', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      submitForm();
      expect(screen.getByText(/password is required/i)).toBeDefined();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when signup password is too short', async () => {
      const user = userEvent.setup();
      renderModal({ initialTab: 'signup' });
      await user.type(screen.getByLabelText(/display name/i), 'Alice');
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      await user.type(screen.getByLabelText(/password/i), 'short');
      submitForm();
      expect(screen.getByText(/at least 8 characters/i)).toBeDefined();
      expect(mockSignup).not.toHaveBeenCalled();
    });

    it('shows error when signup display name is missing', async () => {
      const user = userEvent.setup();
      renderModal({ initialTab: 'signup' });
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      submitForm();
      expect(screen.getByText(/display name is required/i)).toBeDefined();
      expect(mockSignup).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Login flow
  // ---------------------------------------------------------------------------

  describe('login flow', () => {
    it('calls login with trimmed email and password', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({ id: '1', email: 'a@b.com' });
      renderModal();
      await user.type(screen.getByLabelText(/email/i), '  a@b.com  ');
      await user.type(screen.getByLabelText(/password/i), 'mypassword');
      submitForm();
      await waitFor(() =>
        expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'mypassword')
      );
    });

    it('calls onSuccess then onClose after successful login', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({ id: '1' });
      renderModal();
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      await user.type(screen.getByLabelText(/password/i), 'mypassword');
      submitForm();
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('works without onSuccess prop', async () => {
      const user = userEvent.setup();
      mockLogin.mockResolvedValue({ id: '1' });
      render(<AuthModal onClose={mockOnClose} />);
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      await user.type(screen.getByLabelText(/password/i), 'mypassword');
      submitForm();
      await waitFor(() => expect(mockOnClose).toHaveBeenCalled());
    });

    it('displays API error message on login failure', async () => {
      const user = userEvent.setup();
      mockLogin.mockRejectedValue(new Error('Invalid email or password'));
      renderModal();
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      await user.type(screen.getByLabelText(/password/i), 'wrongpass');
      submitForm();
      await waitFor(() =>
        expect(screen.getByText(/invalid email or password/i)).toBeDefined()
      );
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('shows Signing in… while request is in flight', async () => {
      let resolveLogin;
      mockLogin.mockReturnValue(new Promise((r) => { resolveLogin = r; }));
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      await user.type(screen.getByLabelText(/password/i), 'mypassword');
      submitForm();
      expect(screen.getByText(/signing in…/i)).toBeDefined();
      expect(document.querySelector('button[type="submit"]').disabled).toBe(true);
      resolveLogin({ id: '1' });
    });

    it('disables all inputs while submitting', async () => {
      let resolveLogin;
      mockLogin.mockReturnValue(new Promise((r) => { resolveLogin = r; }));
      const user = userEvent.setup();
      renderModal();
      await user.type(screen.getByLabelText(/email/i), 'a@b.com');
      await user.type(screen.getByLabelText(/password/i), 'mypassword');
      submitForm();
      expect(screen.getByLabelText(/email/i).disabled).toBe(true);
      expect(screen.getByLabelText(/password/i).disabled).toBe(true);
      resolveLogin({ id: '1' });
    });
  });

  // ---------------------------------------------------------------------------
  // Signup flow
  // ---------------------------------------------------------------------------

  describe('signup flow', () => {
    it('calls signup with email, password, and trimmed display name', async () => {
      const user = userEvent.setup();
      mockSignup.mockResolvedValue({ id: '1', email: 'alice@b.com' });
      renderModal({ initialTab: 'signup' });
      await user.type(screen.getByLabelText(/display name/i), '  Alice  ');
      await user.type(screen.getByLabelText(/email/i), 'alice@b.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      submitForm();
      await waitFor(() =>
        expect(mockSignup).toHaveBeenCalledWith('alice@b.com', 'password123', 'Alice')
      );
    });

    it('calls onSuccess then onClose after successful signup', async () => {
      const user = userEvent.setup();
      mockSignup.mockResolvedValue({ id: '1' });
      renderModal({ initialTab: 'signup' });
      await user.type(screen.getByLabelText(/display name/i), 'Alice');
      await user.type(screen.getByLabelText(/email/i), 'alice@b.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      submitForm();
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });
    });

    it('displays API error on signup failure', async () => {
      const user = userEvent.setup();
      mockSignup.mockRejectedValue(new Error('Email address is already registered'));
      renderModal({ initialTab: 'signup' });
      await user.type(screen.getByLabelText(/display name/i), 'Alice');
      await user.type(screen.getByLabelText(/email/i), 'alice@b.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      submitForm();
      await waitFor(() =>
        expect(screen.getByText(/email address is already registered/i)).toBeDefined()
      );
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('shows Creating account… while request is in flight', async () => {
      let resolveSignup;
      mockSignup.mockReturnValue(new Promise((r) => { resolveSignup = r; }));
      const user = userEvent.setup();
      renderModal({ initialTab: 'signup' });
      await user.type(screen.getByLabelText(/display name/i), 'Alice');
      await user.type(screen.getByLabelText(/email/i), 'alice@b.com');
      await user.type(screen.getByLabelText(/password/i), 'password123');
      submitForm();
      expect(screen.getByText(/creating account…/i)).toBeDefined();
      resolveSignup({ id: '1' });
    });
  });

  // ---------------------------------------------------------------------------
  // Close / dismiss
  // ---------------------------------------------------------------------------

  describe('close behavior', () => {
    it('calls onClose when the X button is clicked', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByRole('button', { name: /close/i }));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when the backdrop is clicked', () => {
      renderModal();
      fireEvent.mouseDown(document.querySelector('.modal-backdrop'));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not call onClose when the modal panel itself is clicked', () => {
      renderModal();
      fireEvent.mouseDown(document.querySelector('.modal'));
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });
});
