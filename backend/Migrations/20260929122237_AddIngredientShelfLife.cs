using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NutriCost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddIngredientShelfLife : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "shelf_life",
                table: "ingredients",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "shelf_life",
                table: "ingredients");
        }
    }
}
