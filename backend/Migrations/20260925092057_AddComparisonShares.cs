using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NutriCost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddComparisonShares : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "comparison_shares",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    comparison_save_id = table.Column<string>(type: "text", nullable: false),
                    shared_by_user_id = table.Column<string>(type: "text", nullable: false),
                    shared_with_user_id = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_comparison_shares", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_comparison_shares_comparison_save_id",
                table: "comparison_shares",
                column: "comparison_save_id");

            migrationBuilder.CreateIndex(
                name: "IX_comparison_shares_shared_with_user_id",
                table: "comparison_shares",
                column: "shared_with_user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "comparison_shares");
        }
    }
}
