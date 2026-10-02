using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Zarqa.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class OptionalEventTime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "event_at",
                table: "reports");

            migrationBuilder.AddColumn<DateOnly>(
                name: "event_date",
                table: "reports",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<TimeOnly>(
                name: "event_time",
                table: "reports",
                type: "time without time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "event_date",
                table: "reports");

            migrationBuilder.DropColumn(
                name: "event_time",
                table: "reports");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "event_at",
                table: "reports",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));
        }
    }
}
