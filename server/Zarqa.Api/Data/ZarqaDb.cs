using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Zarqa.Api.Data;

public class ZarqaDb(DbContextOptions<ZarqaDb> options) : DbContext(options), IDataProtectionKeyContext
{
    /// <summary>Cookie encryption keys, so sign-ins survive restarts and redeploys.</summary>
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    /// <summary>text-embedding-3-small, the model the benchmark's numbers are based on.</summary>
    public const int EmbeddingDimensions = 1536;

    public DbSet<User> Users => Set<User>();
    public DbSet<LoginCode> LoginCodes => Set<LoginCode>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<Photo> Photos => Set<Photo>();
    public DbSet<Match> Matches => Set<Match>();
    public DbSet<MatchJob> MatchJobs => Set<MatchJob>();
    public DbSet<ReviewLog> ReviewLogs => Set<ReviewLog>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<ConversationRead> ConversationReads => Set<ConversationRead>();
    public DbSet<PushSubscription> PushSubscriptions => Set<PushSubscription>();

    protected override void ConfigureConventions(ModelConfigurationBuilder b)
    {
        // Enums as readable strings: the review log and admin queries stay legible.
        b.Properties<ReportKind>().HaveConversion<string>();
        b.Properties<ReportStatus>().HaveConversion<string>();
        b.Properties<MatchStatus>().HaveConversion<string>();
        b.Properties<MatchDecider>().HaveConversion<string>();
        b.Properties<ConversationStatus>().HaveConversion<string>();
        b.Properties<MessageKind>().HaveConversion<string>();
        b.Properties<HandoverStatus>().HaveConversion<string>();
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasPostgresExtension("vector");

        b.Entity<User>(e =>
        {
            e.Property(x => x.Email).HasMaxLength(254);
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.FirstName).HasMaxLength(40);
        });

        b.Entity<LoginCode>(e => e.HasIndex(x => new { x.Email, x.CreatedAt }));

        b.Entity<Location>(e => e.HasKey(x => x.Name));

        b.Entity<Report>(e =>
        {
            e.Property(x => x.CategoryText).HasMaxLength(60);
            e.Property(x => x.Title).HasMaxLength(80);
            e.Property(x => x.Description).HasMaxLength(500);
            e.Property(x => x.LocationText).HasMaxLength(120);
            e.Property(x => x.Embedding).HasColumnType($"vector({EmbeddingDimensions})");
            e.HasIndex(x => new { x.UserId, x.CreatedAt });
            e.HasIndex(x => new { x.Kind, x.Status });
            e.HasMany(x => x.Photos).WithOne().HasForeignKey(p => p.ReportId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId);
        });

        b.Entity<Match>(e =>
        {
            e.HasIndex(x => new { x.LostId, x.FoundId }).IsUnique();
            e.HasOne(x => x.Lost).WithMany().HasForeignKey(x => x.LostId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Found).WithMany().HasForeignKey(x => x.FoundId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<MatchJob>(e => e.HasIndex(x => new { x.CompletedAt, x.RunAfter }));

        b.Entity<ReviewLog>(e =>
        {
            e.Property(x => x.Payload).HasColumnType("jsonb");
            e.HasIndex(x => x.ReportId);
        });

        b.Entity<Conversation>(e =>
        {
            e.HasIndex(x => x.MatchId).IsUnique();
            e.HasIndex(x => x.LostUserId);
            e.HasIndex(x => x.FoundUserId);
            e.HasOne(x => x.Match).WithMany().HasForeignKey(x => x.MatchId);
        });

        b.Entity<Message>(e =>
        {
            e.Property(x => x.Body).HasMaxLength(2000);
            e.HasIndex(x => new { x.ConversationId, x.Id });
        });

        b.Entity<ConversationRead>(e => e.HasKey(x => new { x.UserId, x.ConversationId }));

        b.Entity<PushSubscription>(e => e.HasIndex(x => x.Endpoint).IsUnique());
    }
}
