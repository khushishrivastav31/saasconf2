"""Enable pgcrypto extension for column-level encryption.

Revision ID: 090_pgcrypto_extension
Revises: 089_contact_name_pronouns
Create Date: 2026-02-18
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "090_pgcrypto_extension"
down_revision: str = "089_contact_name_pronouns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enable pgcrypto extension for future column encryption
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # Create helper functions for application-level encryption/decryption
    # These use PGP symmetric encryption with a key passed at runtime
    op.execute("""
        CREATE OR REPLACE FUNCTION encrypt_value(plaintext text, encryption_key text)
        RETURNS bytea AS $$
        BEGIN
            RETURN pgp_sym_encrypt(plaintext, encryption_key);
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION decrypt_value(ciphertext bytea, encryption_key text)
        RETURNS text AS $$
        BEGIN
            RETURN pgp_sym_decrypt(ciphertext, encryption_key);
        EXCEPTION
            WHEN OTHERS THEN
                RETURN NULL;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
    """)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS decrypt_value(bytea, text)")
    op.execute("DROP FUNCTION IF EXISTS encrypt_value(text, text)")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto")
