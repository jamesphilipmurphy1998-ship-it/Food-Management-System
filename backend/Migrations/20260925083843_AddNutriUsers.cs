using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NutriCost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNutriUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "nutri_users",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    username = table.Column<string>(type: "text", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    display_name = table.Column<string>(type: "text", nullable: false),
                    pass_hash = table.Column<string>(type: "text", nullable: false),
                    site_role = table.Column<string>(type: "text", nullable: false, defaultValue: "user"),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_nutri_users", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_nutri_users_username",
                table: "nutri_users",
                column: "username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "nutri_users");
        }
    }
}
