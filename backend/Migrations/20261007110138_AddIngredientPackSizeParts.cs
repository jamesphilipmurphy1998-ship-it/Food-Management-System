using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NutriCost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddIngredientPackSizeParts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "pack_size_unit",
                table: "ingredients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "pack_size_value",
                table: "ingredients",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "pack_size_unit",
                table: "ingredients");

            migrationBuilder.DropColumn(
                name: "pack_size_value",
                table: "ingredients");
        }
    }
}
