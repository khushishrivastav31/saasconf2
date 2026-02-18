"""Add data retention cleanup functions.

Revision ID: 091_data_retention
Revises: 090_pgcrypto_extension
Create Date: 2026-02-18
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "091_data_retention"
down_revision: str = "090_pgcrypto_extension"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Cleanup expired refresh tokens (admin tokens)
    op.execute("""
        CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
        RETURNS integer AS $$
        DECLARE
            deleted_count integer;
        BEGIN
            DELETE FROM refresh_tokens
            WHERE expires_at < NOW() - INTERVAL '7 days'
               OR revoked_at < NOW() - INTERVAL '7 days';
            GET DIAGNOSTICS deleted_count = ROW_COUNT;
            RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Cleanup expired applicant refresh tokens
    op.execute("""
        CREATE OR REPLACE FUNCTION cleanup_expired_applicant_tokens()
        RETURNS integer AS $$
        DECLARE
            deleted_count integer;
        BEGIN
            DELETE FROM applicant_refresh_tokens
            WHERE expires_at < NOW() - INTERVAL '7 days'
               OR revoked_at < NOW() - INTERVAL '7 days';
            GET DIAGNOSTICS deleted_count = ROW_COUNT;

            -- Also clean up expired password reset tokens
            DELETE FROM applicant_password_resets
            WHERE expires_at < NOW() - INTERVAL '24 hours'
               OR used_at < NOW() - INTERVAL '24 hours';

            -- Clean up expired email verification tokens
            DELETE FROM applicant_email_verifications
            WHERE expires_at < NOW() - INTERVAL '7 days'
               OR used_at < NOW() - INTERVAL '7 days';

            RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Cleanup old audit logs (keep 1 year)
    op.execute("""
        CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
        RETURNS integer AS $$
        DECLARE
            deleted_count integer;
        BEGIN
            DELETE FROM audit_logs
            WHERE created_at < NOW() - INTERVAL '365 days';
            GET DIAGNOSTICS deleted_count = ROW_COUNT;
            RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Master cleanup function that runs all cleanups
    op.execute("""
        CREATE OR REPLACE FUNCTION run_data_retention_cleanup()
        RETURNS TABLE(task text, deleted_rows integer) AS $$
        BEGIN
            task := 'expired_refresh_tokens';
            deleted_rows := cleanup_expired_refresh_tokens();
            RETURN NEXT;

            task := 'expired_applicant_tokens';
            deleted_rows := cleanup_expired_applicant_tokens();
            RETURN NEXT;

            task := 'old_audit_logs';
            deleted_rows := cleanup_old_audit_logs();
            RETURN NEXT;
        END;
        $$ LANGUAGE plpgsql;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS run_data_retention_cleanup()")
    op.execute("DROP FUNCTION IF EXISTS cleanup_old_audit_logs()")
    op.execute("DROP FUNCTION IF EXISTS cleanup_expired_applicant_tokens()")
    op.execute("DROP FUNCTION IF EXISTS cleanup_expired_refresh_tokens()")
