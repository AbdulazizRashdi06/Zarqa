using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Zarqa.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SearchRendering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "search_english",
                table: "reports",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "search_hash",
                table: "reports",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "search_place",
                table: "reports",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "search_english",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "search_hash",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "search_place",
                table: "reports");
        }
    }
}
