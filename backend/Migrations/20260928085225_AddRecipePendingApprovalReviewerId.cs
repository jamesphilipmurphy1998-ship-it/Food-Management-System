using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NutriCost.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRecipePendingApprovalReviewerId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "pending_approval_reviewer_id",
                table: "recipes",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "pending_approval_reviewer_id",
                table: "recipes");
        }
    }
}
