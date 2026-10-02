using Zarqa.Api.Auth;

namespace Zarqa.Tests;

public class EmailRulesTests
{
    [Theory]
    [InlineData("ali@gutech.edu.om", "ali@gutech.edu.om")]
    [InlineData("Ali.Rashdi@Student.GUtech.edu.om", "ali.rashdi@student.gutech.edu.om")]
    [InlineData("  staff@gutech.edu.om ", "staff@gutech.edu.om")]
    [InlineData("x@any.sub.gutech.edu.om", "x@any.sub.gutech.edu.om")]
    public void Accepts_gutech_and_its_subdomains(string input, string expected) =>
        Assert.Equal(expected, EmailRules.NormalizeSignInEmail(input));

    [Theory]
    [InlineData("ali@fakegutech.edu.om")]          // suffix match would wrongly accept this
    [InlineData("ali@gutech.edu.om.evil.com")]
    [InlineData("ali@gutech.edu.om.com")]
    [InlineData("ali@student.fakegutech.edu.om")]
    [InlineData("ali@gmail.com")]
    [InlineData("Ali <ali@gutech.edu.om>")]
    [InlineData("@gutech.edu.om")]
    [InlineData("ali@")]
    [InlineData("")]
    [InlineData(null)]
    public void Refuses_everything_else(string? input) =>
        Assert.Null(EmailRules.NormalizeSignInEmail(input));

    [Theory]
    [InlineData("  TESTER@gmail.com ", "tester@gmail.com")]
    [InlineData("other@gmail.com", null)]
    [InlineData("tester+other@gmail.com", null)]
    [InlineData("tester@gmail.com.evil.com", null)]
    [InlineData("Tester <tester@gmail.com>", null)]
    [InlineData("ali@fakegutech.edu.om", null)]
    public void Testing_exceptions_match_only_the_exact_bare_address(string input, string? expected) =>
        Assert.Equal(expected, EmailRules.NormalizeSignInEmail(input, " testER@gmail.com, second@example.invalid "));

    [Theory]
    [InlineData("abdulaziz.rashdi@student.gutech.edu.om", "Abdulaziz")]
    [InlineData("MARYAM_AL@gutech.edu.om", "Maryam")]
    [InlineData("s12345@student.gutech.edu.om", null)]
    [InlineData("a.b@gutech.edu.om", null)]
    public void Guesses_a_first_name(string email, string? expected) =>
        Assert.Equal(expected, EmailRules.GuessFirstName(email));
}

public class LoginCodesTests
{
    [Fact]
    public void Generates_six_digits()
    {
        for (var i = 0; i < 200; i++) Assert.True(LoginCodes.IsWellFormed(LoginCodes.Generate()));
    }

    [Fact]
    public void Verifies_only_the_right_code_for_the_right_email()
    {
        var stored = LoginCodes.Hash("a@gutech.edu.om", "042917");
        Assert.True(LoginCodes.Verify(stored, "a@gutech.edu.om", "042917"));
        Assert.False(LoginCodes.Verify(stored, "a@gutech.edu.om", "042918"));
        Assert.False(LoginCodes.Verify(stored, "b@gutech.edu.om", "042917"));
    }

    [Fact]
    public void Same_code_hashes_differently_each_time()
    {
        Assert.NotEqual(LoginCodes.Hash("a@gutech.edu.om", "111111"), LoginCodes.Hash("a@gutech.edu.om", "111111"));
    }

    [Theory]
    [InlineData("12345")]
    [InlineData("1234567")]
    [InlineData("12a456")]
    [InlineData("١٢٣٤٥٦")] // Arabic-Indic digits are not ASCII digits
    [InlineData(null)]
    public void Rejects_malformed_codes(string? code) => Assert.False(LoginCodes.IsWellFormed(code));
}
