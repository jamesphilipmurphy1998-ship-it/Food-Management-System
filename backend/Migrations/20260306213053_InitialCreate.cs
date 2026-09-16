using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace NutriCost.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ingredients",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    code = table.Column<string>(type: "text", nullable: false),
                    alt_codes = table.Column<List<string>>(type: "text[]", nullable: false),
                    description_tags = table.Column<List<string>>(type: "text[]", nullable: false),
                    cat = table.Column<string>(type: "text", nullable: false),
                    kj = table.Column<decimal>(type: "numeric", nullable: false),
                    kcal = table.Column<decimal>(type: "numeric", nullable: false),
                    fat = table.Column<decimal>(type: "numeric", nullable: false),
                    sat = table.Column<decimal>(type: "numeric", nullable: false),
                    carb = table.Column<decimal>(type: "numeric", nullable: false),
                    sugar = table.Column<decimal>(type: "numeric", nullable: false),
                    fibre = table.Column<decimal>(type: "numeric", nullable: false),
                    protein = table.Column<decimal>(type: "numeric", nullable: false),
                    salt = table.Column<decimal>(type: "numeric", nullable: false),
                    cost = table.Column<decimal>(type: "numeric", nullable: false),
                    supplier = table.Column<string>(type: "text", nullable: false),
                    allergens = table.Column<List<string>>(type: "text[]", nullable: false),
                    fvn = table.Column<bool>(type: "boolean", nullable: false),
                    approved = table.Column<bool>(type: "boolean", nullable: false),
                    created = table.Column<string>(type: "text", nullable: false),
                    version_history = table.Column<List<string>>(type: "text[]", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ingredients", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "recipes",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    code = table.Column<string>(type: "text", nullable: false),
                    desc = table.Column<string>(type: "text", nullable: false),
                    type = table.Column<string>(type: "text", nullable: false),
                    recipe_type = table.Column<string>(type: "text", nullable: false),
                    serving = table.Column<decimal>(type: "numeric", nullable: false),
                    approved = table.Column<bool>(type: "boolean", nullable: false),
                    description_tags = table.Column<List<string>>(type: "text[]", nullable: false),
                    created = table.Column<string>(type: "text", nullable: false),
                    version_history = table.Column<List<string>>(type: "text[]", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recipes", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "recipe_lines",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    recipe_id = table.Column<string>(type: "text", nullable: false),
                    ingredient_id = table.Column<string>(type: "text", nullable: true),
                    sub_recipe_id = table.Column<string>(type: "text", nullable: true),
                    qty = table.Column<decimal>(type: "numeric", nullable: false),
                    uom = table.Column<string>(type: "text", nullable: false),
                    fvn_override = table.Column<decimal>(type: "numeric", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recipe_lines", x => x.id);
                    table.ForeignKey(
                        name: "FK_recipe_lines_recipes_recipe_id",
                        column: x => x.recipe_id,
                        principalTable: "recipes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_recipe_lines_ingredient_id",
                table: "recipe_lines",
                column: "ingredient_id");

            migrationBuilder.CreateIndex(
                name: "IX_recipe_lines_recipe_id",
                table: "recipe_lines",
                column: "recipe_id");

            migrationBuilder.CreateIndex(
                name: "IX_recipe_lines_sub_recipe_id",
                table: "recipe_lines",
                column: "sub_recipe_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ingredients");

            migrationBuilder.DropTable(
                name: "recipe_lines");

            migrationBuilder.DropTable(
                name: "recipes");
        }
    }
}
