using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Zarqa.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Consent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "consent_version",
                table: "users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "consented_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "consent_version",
                table: "users");

            migrationBuilder.DropColumn(
                name: "consented_at",
                table: "users");
        }
    }
}
