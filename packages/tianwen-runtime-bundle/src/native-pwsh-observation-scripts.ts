/** Trusted scripts only; submitted command text is encoded DATA for the native AST parser. */
export function qualificationScript(command: string): string {
  const data = Buffer.from(command, 'utf8').toString('base64')
  return `
try {
  $source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}'));
  $tokens = $null; $errors = $null;
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors);
  if ($errors.Count -ne 0 -or $ast.BeginBlock -or $ast.ProcessBlock -or $ast.CleanBlock -or $ast.ParamBlock -or $ast.DynamicParamBlock -or $ast.UsingStatements.Count -gt 0 -or $ast.EndBlock.Traps.Count -gt 0) { throw 'shape'; };
  $commands = [Collections.Generic.List[object]]::new();
  foreach ($statement in $ast.EndBlock.Statements) {
    if ($statement -isnot [System.Management.Automation.Language.PipelineAst] -or $statement.Background) { throw 'statement'; };
    foreach ($cmd in $statement.PipelineElements) {
      if ($cmd -isnot [System.Management.Automation.Language.CommandAst] -or $cmd.InvocationOperator.ToString() -ne 'Unknown' -or $cmd.Redirections.Count -ne 0) { throw 'command'; };
      if ($cmd.CommandElements[0] -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) { throw 'name'; };
      $argsList = [Collections.Generic.List[object]]::new();
      for ($i = 1; $i -lt $cmd.CommandElements.Count; $i++) {
        $item = $cmd.CommandElements[$i];
        if ($item -is [System.Management.Automation.Language.CommandParameterAst]) {
          if ($null -ne $item.Argument) { throw 'parameter'; };
          $argsList.Add(@{kind='parameter'; value=$item.ParameterName});
        } elseif ($item -is [System.Management.Automation.Language.StringConstantExpressionAst]) {
          $argsList.Add(@{kind='literal'; value=$item.Value});
        } elseif ($item -is [System.Management.Automation.Language.ConstantExpressionAst] -and $item.Value -is [int]) {
          $argsList.Add(@{kind='literal'; value=$item.Value});
        } elseif ($item -is [System.Management.Automation.Language.ArrayLiteralAst]) {
          $values = [Collections.Generic.List[string]]::new();
          foreach ($element in $item.Elements) {
            if ($element -isnot [System.Management.Automation.Language.StringConstantExpressionAst]) { throw 'array'; };
            $values.Add($element.Value);
          };
          $argsList.Add(@{kind='literal'; value=@($values.ToArray())});
        } else { throw 'argument'; };
      };
      $commands.Add(@{name=$cmd.GetCommandName(); arguments=@($argsList.ToArray())});
      if ($commands.Count -gt 16) { throw 'count'; };
    };
  };
  [Console]::Write((Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject @($commands.ToArray()) -Depth 8 -Compress));
} catch { [Console]::Write('null'); };
`
}

/** One physical prefix line preserves the original command's native error line numbers. */
export function observationPrefix(pipeName: string, nonce: string, identity: readonly string[], digest: string): string {
  const fields = [...identity, digest].map(value => `'${Buffer.from(value).toString('base64')}'`).join(',')
  return `
$twPipe = $null;
try {
  $twPipe = [IO.Pipes.NamedPipeServerStream]::new('${pipeName}', [IO.Pipes.PipeDirection]::InOut, 1, [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::Asynchronous);
  $twWait = [Threading.CancellationTokenSource]::new(250);
  try { $null = $twPipe.WaitForConnectionAsync($twWait.Token).GetAwaiter().GetResult(); } finally { $twWait.Dispose(); };
  $twState = @{pipe=$twPipe; frames=0; bytes=0; failed=$false};
  $twSend = {
    param($values);
    if ($twState.failed) { return; };
    try {
      $encoded = [Collections.Generic.List[string]]::new();
      foreach ($value in $values) { $encoded.Add([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$value))); };
      $bytes = [Text.Encoding]::UTF8.GetBytes([string]::Join("\`t", $encoded) + "\`n");
      $twState.frames++; $twState.bytes += $bytes.Length;
      if ($twState.frames -gt 64 -or $twState.bytes -gt 65536) { throw 'limit'; };
      $writeLimit = [Threading.CancellationTokenSource]::new(100);
      try { $null = $twState.pipe.WriteAsync($bytes, 0, $bytes.Length, $writeLimit.Token).GetAwaiter().GetResult(); } finally { $writeLimit.Dispose(); };
    } catch { $twState.failed=$true; $twState.pipe.Dispose(); };
  };
  $twLocation = $ExecutionContext.SessionState.Path.CurrentLocation;
  $twBound = @(${fields});
  $twIdentity = @(); foreach ($v in $twBound) { $twIdentity += [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($v)); };
  & $twSend (@('start','${nonce}',[string]$PID,[Diagnostics.Process]::GetCurrentProcess().MainModule.FileName,$PSVersionTable.PSVersion.ToString(),[string]$ExecutionContext.SessionState.LanguageMode,[string]$twLocation.Path,[string]$twLocation.Provider.Name,[string]$twLocation.Provider.ImplementingType.FullName,[string]$twLocation.Provider.ImplementingType.Assembly.Location) + $twIdentity);
  $null = Microsoft.PowerShell.Utility\\Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    try {
      $ExecutionContext.InvokeCommand.PostCommandLookupAction = $null;
      & $twSend @('terminal','${nonce}',[string]$PID,'PowerShell.Exiting',[string]$Event.SourceIdentifier);
      $twState.pipe.Dispose();
    } catch {};
  };
  $ExecutionContext.InvokeCommand.PostCommandLookupAction = {
    param($sender,$lookup);
    try {
      $info=$lookup.Command; $loc=$ExecutionContext.SessionState.Path.CurrentLocation;
      & $twSend @('lookup','${nonce}',[string]$PID,[string]$lookup.CommandName,[string]$info.CommandType,[string]$info.Name,[string]$info.ModuleName,[string]$info.Module.Path,[string]$info.ImplementingType.FullName,[string]$info.ImplementingType.Assembly.Location,[string]$loc.Path,[string]$loc.Provider.Name);
    } catch { $twState.failed=$true; $twState.pipe.Dispose(); };
  };
} catch { if ($null -ne $twPipe) { $twPipe.Dispose(); }; };
`.replace(/\r?\n/gu, ' ')
}
