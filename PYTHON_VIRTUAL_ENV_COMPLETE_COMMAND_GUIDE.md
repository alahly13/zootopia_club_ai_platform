# Python & Virtual Environment Complete Command Guide

This guide is a practical English reference for Python commands and virtual environment workflows you may need in your current project or almost any future project.

It is especially useful for:

- local development
- Python package installation
- project isolation
- troubleshooting Python environments
- Windows / Linux / macOS usage
- server setup basics

---

## 1) What Python virtual environments are

A **virtual environment** is an isolated Python environment for one project.

It helps you:

- keep project dependencies separate
- avoid conflicts between projects
- avoid polluting the global Python installation
- reproduce installs more safely
- manage project-specific package versions

Common virtual environment folder names:

- `.venv`
- `venv`

Recommended default: **`.venv`**

---

## 2) Check Python installation

### Check Python version

```bash
python --version
```

**What it does:**  
Shows the Python version currently available from your terminal.

---

### Check Python 3 version explicitly

```bash
python3 --version
```

**What it does:**  
Shows the Python 3 version on systems where `python3` is used.

---

### Check Python via Windows launcher

```bash
py --version
```

**What it does:**  
Shows the default Python version through the Windows Python launcher.

---

### List all Python versions on Windows

```bash
py --list
```

**What it does:**  
Shows all Python versions installed and registered with the Windows launcher.

---

### Locate Python executable

**Windows**
```bash
where python
```

**Linux / macOS**
```bash
which python
```

**What it does:**  
Shows which Python executable is being used.

---

## 3) Check pip installation

### Show pip version

```bash
python -m pip --version
```

**What it does:**  
Shows the installed pip version associated with the current Python interpreter.

---

### Upgrade pip

```bash
python -m pip install --upgrade pip
```

**What it does:**  
Upgrades pip to the latest available version.

---

## 4) Create a virtual environment

### Create a virtual environment named `.venv`

```bash
python -m venv .venv
```

**What it does:**  
Creates a new isolated Python environment in the `.venv` folder.

---

### Create a virtual environment with Python 3

```bash
python3 -m venv .venv
```

**What it does:**  
Creates the environment using `python3`.

---

### Create a virtual environment with Windows launcher

```bash
py -m venv .venv
```

**What it does:**  
Creates the environment using the Windows Python launcher.

---

## 5) Activate a virtual environment

### PowerShell (Windows)

```powershell
.\.venv\Scripts\Activate.ps1
```

**What it does:**  
Activates the virtual environment in PowerShell.

---

### Command Prompt (Windows CMD)

```cmd
.venv\Scripts\activate.bat
```

**What it does:**  
Activates the virtual environment in Command Prompt.

---

### Git Bash on Windows

```bash
source .venv/Scripts/activate
```

**What it does:**  
Activates the environment from Git Bash.

---

### Linux / macOS

```bash
source .venv/bin/activate
```

**What it does:**  
Activates the environment in Unix-like shells.

---

## 6) Fix PowerShell execution policy issue

If PowerShell blocks activation scripts, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then activate again:

```powershell
.\.venv\Scripts\Activate.ps1
```

**What it does:**  
Temporarily allows activation scripts in the current PowerShell session.

---

## 7) Confirm the virtual environment is active

### Check current Python path

```bash
python -c "import sys; print(sys.executable)"
```

**What it does:**  
Shows the exact Python executable currently in use.

If the virtual environment is active, the path should point inside `.venv`.

---

### Show current environment prefix

```bash
python -c "import sys; print(sys.prefix)"
```

**What it does:**  
Shows the environment prefix directory.

---

### List installed packages

```bash
python -m pip list
```

**What it does:**  
Shows all packages installed inside the currently active environment.

---

## 8) Deactivate a virtual environment

```bash
deactivate
```

**What it does:**  
Exits the active virtual environment and returns to the system Python.

---

## 9) Install packages

### Install one package

```bash
python -m pip install requests
```

**What it does:**  
Installs a single package into the current environment.

---

### Install multiple packages

```bash
python -m pip install requests flask fastapi
```

**What it does:**  
Installs multiple packages at once.

---

### Install from requirements.txt

```bash
python -m pip install -r requirements.txt
```

**What it does:**  
Installs all packages listed in `requirements.txt`.

---

### Install from your project-specific requirements file

```bash
python -m pip install -r server/documentRuntime/python/requirements.txt
```

**What it does:**  
Installs the Python extraction dependencies from your Zootopia Club project.

---

### Force reinstall packages

```bash
python -m pip install --force-reinstall -r requirements.txt
```

**What it does:**  
Reinstalls packages even if they are already installed.

---

### Install without cache

```bash
python -m pip install --no-cache-dir -r requirements.txt
```

**What it does:**  
Installs packages without using pip's package cache.

Useful if you suspect corrupted downloads or interrupted installs.

---

### Upgrade a package

```bash
python -m pip install --upgrade requests
```

**What it does:**  
Upgrades one package to the latest available version.

---

## 10) Uninstall packages

### Uninstall one package

```bash
python -m pip uninstall requests
```

**What it does:**  
Removes the selected package from the current environment.

---

### Uninstall multiple packages

```bash
python -m pip uninstall requests flask
```

**What it does:**  
Removes multiple packages.

---

### Uninstall from requirements file

```bash
python -m pip uninstall -r requirements.txt -y
```

**What it does:**  
Uninstalls all packages listed in `requirements.txt` without asking for confirmation.

---

### Clean reinstall from requirements file

```bash
python -m pip uninstall -r requirements.txt -y
python -m pip install --no-cache-dir --force-reinstall -r requirements.txt
```

**What it does:**  
Removes and then reinstalls all packages from scratch.

---

## 11) Recreate a virtual environment from scratch

### Windows PowerShell

```powershell
Remove-Item -Recurse -Force .venv
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

**What it does:**  
Deletes the environment, recreates it, activates it, upgrades pip, and reinstalls dependencies.

---

### Linux / macOS

```bash
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

**What it does:**  
Same clean rebuild flow for Unix-like systems.

---

## 12) Freeze dependencies

### Create requirements.txt

```bash
python -m pip freeze > requirements.txt
```

**What it does:**  
Writes all currently installed package versions to `requirements.txt`.

---

### Create a project-specific freeze file

```bash
python -m pip freeze > server/documentRuntime/python/requirements.txt
```

**What it does:**  
Writes the current environment's packages into the project extraction requirements file.

---

## 13) Show installed package details

### Show package details

```bash
python -m pip show requests
```

**What it does:**  
Displays metadata about a package, including version, location, and dependencies.

---

### Check whether a package is installed

```bash
python -m pip show firebase-admin
```

**What it does:**  
Returns package information if installed, otherwise nothing useful.

---

## 14) Check package dependency problems

### Check broken dependencies

```bash
python -m pip check
```

**What it does:**  
Detects broken or incompatible installed package dependencies.

---

## 15) Test imports quickly

### Test one import

```bash
python -c "import requests; print('OK')"
```

**What it does:**  
Confirms that the package can be imported successfully.

---

### Test multiple imports

```bash
python -c "import requests, flask, fastapi; print('All good')"
```

**What it does:**  
Quickly verifies multiple modules.

---

### Test project-specific libraries

```bash
python -c "import paddleocr; import pypdf; print('Extraction stack OK')"
```

**What it does:**  
Checks whether your document extraction stack is importable.

---

## 16) Run Python files

### Run a Python script

```bash
python script.py
```

**What it does:**  
Runs a Python file.

---

### Run a project script

```bash
python server/documentRuntime/python/extract_document.py
```

**What it does:**  
Runs the extraction worker directly if your project supports that mode.

---

### Run a module

```bash
python -m http.server
```

**What it does:**  
Runs a Python module by module name instead of a file path.

---

## 17) Compile check Python syntax

```bash
python -m py_compile script.py
```

**What it does:**  
Checks syntax by compiling the file to bytecode.

---

### Compile your project worker

```bash
python -m py_compile server/documentRuntime/python/extract_document.py
```

**What it does:**  
Checks whether the extraction worker file has valid syntax.

---

## 18) Work with requirements files

### Install production dependencies

```bash
python -m pip install -r requirements.txt
```

---

### Install development dependencies

```bash
python -m pip install -r requirements-dev.txt
```

---

### Split requirements example

You may have:
- `requirements.txt` for runtime packages
- `requirements-dev.txt` for test and tooling packages

---

## 19) Create requirements-dev.txt example

```text
pytest
black
ruff
mypy
```

**What it does:**  
A common dev-only requirements file for testing and code quality tools.

---

## 20) Common useful Python tooling commands

### Install pytest

```bash
python -m pip install pytest
```

---

### Run pytest

```bash
pytest
```

or:

```bash
python -m pytest
```

**What it does:**  
Runs your Python tests.

---

### Install black

```bash
python -m pip install black
```

---

### Format code with black

```bash
black .
```

**What it does:**  
Formats Python code automatically.

---

### Install ruff

```bash
python -m pip install ruff
```

---

### Run ruff

```bash
ruff check .
```

**What it does:**  
Runs linting on your Python code.

---

### Install mypy

```bash
python -m pip install mypy
```

---

### Run mypy

```bash
mypy .
```

**What it does:**  
Runs static type checking.

---

## 21) Create and use `.python-version`

### Example file content

```text
3.11
```

**What it does:**  
Indicates the preferred Python version for tools like pyenv or other version managers.

---

## 22) Use pyenv (Linux/macOS, optional)

### Install a Python version

```bash
pyenv install 3.11.9
```

---

### Set local Python version

```bash
pyenv local 3.11.9
```

**What it does:**  
Pins the local project to a specific Python version.

---

## 23) Check virtual environment paths

### Show site-packages path

```bash
python -c "import site; print(site.getsitepackages())"
```

**What it does:**  
Shows where Python packages are installed.

---

### Show sys.path

```bash
python -c "import sys; print('\\n'.join(sys.path))"
```

**What it does:**  
Shows module search paths.

---

## 24) Environment variables in Python

### Read an environment variable

```bash
python -c "import os; print(os.getenv('MY_VAR'))"
```

**What it does:**  
Prints the value of the environment variable if it exists.

---

## 25) Create `.env` style local workflows carefully

Never commit secret values into Git.

Keep files like:
- `.env`
- `.env.local`
- credential JSON files

out of version control.

Example `.gitignore` additions:

```gitignore
.venv/
.env
.env.*
serviceAccountKey.json
**/serviceAccountKey.json
```

---

## 26) Remove cached Python files

### Delete `__pycache__` on Linux/macOS

```bash
find . -type d -name "__pycache__" -exec rm -rf {} +
```

---

### Delete `__pycache__` on PowerShell

```powershell
Get-ChildItem -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
```

**What it does:**  
Cleans Python cache folders.

---

## 27) Check installed packages with freeze

```bash
python -m pip freeze
```

**What it does:**  
Prints the exact installed packages and versions.

---

## 28) Save reproducible environment

### Best basic flow

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

**What it does:**  
Creates a reproducible project environment.

---

## 29) Use a project-specific commands flow (Windows PowerShell)

```powershell
cd "D:\Zootopia Club AI"
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r server\documentRuntime\python\requirements.txt
python -m pip list
```

**What it does:**  
Creates and activates the correct project environment for your current project.

---

## 30) Daily workflow for your project

### Activate the environment

```powershell
cd "D:\Zootopia Club AI"
.\.venv\Scripts\Activate.ps1
```

### Verify Python

```powershell
python --version
python -m pip --version
```

### Work normally

```powershell
python -m pip list
```

### When done

```powershell
deactivate
```

---

## 31) Troubleshooting commands

### Command not found

```bash
python --version
py --list
where python
```

Use these to confirm what is installed.

---

### Pip seems broken

```bash
python -m ensurepip --upgrade
python -m pip install --upgrade pip
```

**What it does:**  
Repairs or upgrades pip.

---

### Broken install after interrupted internet connection

```bash
python -m pip install --no-cache-dir --force-reinstall -r requirements.txt
```

**What it does:**  
Redownloads and reinstalls dependencies cleanly.

---

### Wrong Python interpreter is active

```bash
python -c "import sys; print(sys.executable)"
```

Use this to confirm whether you are inside the correct virtual environment.

---

## 32) Good practices

- Always use a virtual environment per project.
- Prefer `.venv` as the folder name.
- Do not commit `.venv`.
- Do not install project dependencies globally unless you have a strong reason.
- Upgrade pip before installing large dependency sets.
- Use `requirements.txt` for reproducibility.
- Use `pip check` after complicated installs.
- Recreate the environment if it becomes corrupted.
- Keep secrets out of Git.

---

## 33) Suggested `.gitignore` entries for Python projects

```gitignore
.venv/
venv/
__pycache__/
*.pyc
.python-version
.env
.env.*
```

---

## 34) Commands specifically useful for this project

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r server/documentRuntime/python/requirements.txt
python -m pip list
python -m py_compile server/documentRuntime/python/extract_document.py
python -c "import paddleocr; import pypdf; print('Extraction stack OK')"
deactivate
```

---

## 35) Very short cheat sheet

### Create environment
```bash
python -m venv .venv
```

### Activate
**PowerShell**
```powershell
.\.venv\Scripts\Activate.ps1
```

**Linux/macOS**
```bash
source .venv/bin/activate
```

### Install dependencies
```bash
python -m pip install -r requirements.txt
```

### Upgrade pip
```bash
python -m pip install --upgrade pip
```

### List packages
```bash
python -m pip list
```

### Freeze dependencies
```bash
python -m pip freeze > requirements.txt
```

### Remove environment
```bash
deactivate
```

Delete folder:
```bash
rm -rf .venv
```

or on PowerShell:
```powershell
Remove-Item -Recurse -Force .venv
```

---

End of guide.
