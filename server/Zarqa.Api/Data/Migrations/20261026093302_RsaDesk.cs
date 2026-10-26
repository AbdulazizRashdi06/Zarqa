using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Zarqa.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RsaDesk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "drop_at_rsa",
                table: "reports",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "drop_code",
                table: "reports",
                type: "character varying(6)",
                maxLength: 6,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "rsa_received_at",
                table: "reports",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "rsa_received_by",
                table: "reports",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "collected_at",
                table: "matches",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "collected_by",
                table: "matches",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pickup_code",
                table: "matches",
                type: "character varying(6)",
                maxLength: 6,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "rsa_members",
                columns: table => new
                {
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    added_by = table.Column<Guid>(type: "uuid", nullable: true),
                    added_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_rsa_members", x => x.email);
                });

            migrationBuilder.CreateIndex(
                name: "ix_reports_drop_code",
                table: "reports",
                column: "drop_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_matches_pickup_code",
                table: "matches",
                column: "pickup_code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rsa_members");

            migrationBuilder.DropIndex(
                name: "ix_reports_drop_code",
                table: "reports");

            migrationBuilder.DropIndex(
                name: "ix_matches_pickup_code",
                table: "matches");

            migrationBuilder.DropColumn(
                name: "drop_at_rsa",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "drop_code",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "rsa_received_at",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "rsa_received_by",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "collected_at",
                table: "matches");

            migrationBuilder.DropColumn(
                name: "collected_by",
                table: "matches");

            migrationBuilder.DropColumn(
                name: "pickup_code",
                table: "matches");
        }
    }
}
