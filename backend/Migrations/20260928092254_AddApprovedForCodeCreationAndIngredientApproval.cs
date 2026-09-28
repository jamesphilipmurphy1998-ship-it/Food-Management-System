using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NutriCost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddApprovedForCodeCreationAndIngredientApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "approved_for_code_creation",
                table: "recipes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "approved_for_code_creation",
                table: "ingredients",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "pending_approval",
                table: "ingredients",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "pending_approval_at",
                table: "ingredients",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pending_approval_reviewer_id",
                table: "ingredients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pending_approval_reviewer_name",
                table: "ingredients",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pending_approval_submitted_by_name",
                table: "ingredients",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "approved_for_code_creation",
                table: "recipes");

            migrationBuilder.DropColumn(
                name: "approved_for_code_creation",
                table: "ingredients");

            migrationBuilder.DropColumn(
                name: "pending_approval",
                table: "ingredients");

            migrationBuilder.DropColumn(
                name: "pending_approval_at",
                table: "ingredients");

            migrationBuilder.DropColumn(
                name: "pending_approval_reviewer_id",
                table: "ingredients");

            migrationBuilder.DropColumn(
                name: "pending_approval_reviewer_name",
                table: "ingredients");

            migrationBuilder.DropColumn(
                name: "pending_approval_submitted_by_name",
                table: "ingredients");
        }
    }
}
