namespace keyTriggerCountdown
{
    partial class Form1
    {
        /// <summary>
        /// Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        /// Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        /// Required method for Designer support - do not modify
        /// the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.timeDisplay = new MetroFramework.Controls.MetroLabel();
            this.startBtn = new MetroFramework.Controls.MetroButton();
            this.secondInput = new MetroFramework.Controls.MetroTextBox();
            this.timer1 = new System.Windows.Forms.Timer(this.components);
            this.comboBoxTriggerKey = new MetroFramework.Controls.MetroComboBox();
            this.stopBtn = new MetroFramework.Controls.MetroButton();
            this.metroLabel1 = new MetroFramework.Controls.MetroLabel();
            this.soundTriggerTime = new MetroFramework.Controls.MetroTextBox();
            this.SuspendLayout();
            // 
            // timeDisplay
            // 
            this.timeDisplay.AutoSize = true;
            this.timeDisplay.FontSize = MetroFramework.MetroLabelSize.Tall;
            this.timeDisplay.FontWeight = MetroFramework.MetroLabelWeight.Bold;
            this.timeDisplay.Location = new System.Drawing.Point(123, 136);
            this.timeDisplay.Margin = new System.Windows.Forms.Padding(4, 0, 4, 0);
            this.timeDisplay.Name = "timeDisplay";
            this.timeDisplay.Size = new System.Drawing.Size(91, 25);
            this.timeDisplay.TabIndex = 0;
            this.timeDisplay.Text = "STOPPED";
            this.timeDisplay.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            this.timeDisplay.UseMnemonic = false;
            this.timeDisplay.Click += new System.EventHandler(this.timeDisplay_Click);
            // 
            // startBtn
            // 
            this.startBtn.Location = new System.Drawing.Point(95, 175);
            this.startBtn.Margin = new System.Windows.Forms.Padding(4);
            this.startBtn.Name = "startBtn";
            this.startBtn.Size = new System.Drawing.Size(100, 29);
            this.startBtn.TabIndex = 1;
            this.startBtn.Text = "Start";
            this.startBtn.Click += new System.EventHandler(this.startBtn_Click);
            // 
            // secondInput
            // 
            this.secondInput.Location = new System.Drawing.Point(123, 65);
            this.secondInput.Margin = new System.Windows.Forms.Padding(4);
            this.secondInput.Name = "secondInput";
            this.secondInput.Size = new System.Drawing.Size(42, 29);
            this.secondInput.TabIndex = 2;
            this.secondInput.Text = "9";
            this.secondInput.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            this.secondInput.Click += new System.EventHandler(this.secondInput_Click);
            // 
            // timer1
            // 
            this.timer1.Interval = 1000;
            this.timer1.Tick += new System.EventHandler(this.timer1_Tick);
            // 
            // comboBoxTriggerKey
            // 
            this.comboBoxTriggerKey.FormattingEnabled = true;
            this.comboBoxTriggerKey.ItemHeight = 24;
            this.comboBoxTriggerKey.Items.AddRange(new object[] {
            "F1",
            "F2",
            "F3",
            "F4",
            "F5",
            "F6",
            "F7",
            "F8",
            "F9",
            "F10",
            "F11",
            "F12",
            "D0",
            "D1",
            "D2",
            "D3",
            "D4",
            "D5",
            "D6",
            "D7",
            "D8",
            "D9"});
            this.comboBoxTriggerKey.Location = new System.Drawing.Point(12, 64);
            this.comboBoxTriggerKey.Margin = new System.Windows.Forms.Padding(4);
            this.comboBoxTriggerKey.Name = "comboBoxTriggerKey";
            this.comboBoxTriggerKey.Size = new System.Drawing.Size(84, 30);
            this.comboBoxTriggerKey.TabIndex = 3;
            this.comboBoxTriggerKey.SelectedIndexChanged += new System.EventHandler(this.comboBoxTriggerKey_SelectedIndexChanged);
            // 
            // stopBtn
            // 
            this.stopBtn.Location = new System.Drawing.Point(95, 214);
            this.stopBtn.Name = "stopBtn";
            this.stopBtn.Size = new System.Drawing.Size(100, 31);
            this.stopBtn.TabIndex = 4;
            this.stopBtn.Text = "Stop";
            this.stopBtn.Theme = MetroFramework.MetroThemeStyle.Light;
            this.stopBtn.Click += new System.EventHandler(this.stopBtn_Click);
            // 
            // metroLabel1
            // 
            this.metroLabel1.AutoSize = true;
            this.metroLabel1.Location = new System.Drawing.Point(12, 103);
            this.metroLabel1.Name = "metroLabel1";
            this.metroLabel1.Size = new System.Drawing.Size(172, 20);
            this.metroLabel1.TabIndex = 5;
            this.metroLabel1.Text = "Play sound when less than";
            this.metroLabel1.Click += new System.EventHandler(this.metroLabel1_Click);
            // 
            // soundTriggerTime
            // 
            this.soundTriggerTime.Location = new System.Drawing.Point(225, 102);
            this.soundTriggerTime.Name = "soundTriggerTime";
            this.soundTriggerTime.Size = new System.Drawing.Size(36, 23);
            this.soundTriggerTime.TabIndex = 6;
            this.soundTriggerTime.Text = "2";
            this.soundTriggerTime.TextAlign = System.Windows.Forms.HorizontalAlignment.Center;
            this.soundTriggerTime.Click += new System.EventHandler(this.soundTriggerTime_Click);
            // 
            // Form1
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(8F, 15F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(291, 257);
            this.Controls.Add(this.soundTriggerTime);
            this.Controls.Add(this.metroLabel1);
            this.Controls.Add(this.stopBtn);
            this.Controls.Add(this.comboBoxTriggerKey);
            this.Controls.Add(this.secondInput);
            this.Controls.Add(this.startBtn);
            this.Controls.Add(this.timeDisplay);
            this.Margin = new System.Windows.Forms.Padding(4);
            this.Name = "Form1";
            this.Padding = new System.Windows.Forms.Padding(27, 75, 27, 25);
            this.Text = "Countdown";
            this.ResumeLayout(false);
            this.PerformLayout();

        }

        #endregion

        private MetroFramework.Controls.MetroLabel timeDisplay;
        private MetroFramework.Controls.MetroButton startBtn;
        private MetroFramework.Controls.MetroTextBox secondInput;
        private System.Windows.Forms.Timer timer1;
        private MetroFramework.Controls.MetroComboBox comboBoxTriggerKey;
        private MetroFramework.Controls.MetroButton stopBtn;
        private MetroFramework.Controls.MetroLabel metroLabel1;
        private MetroFramework.Controls.MetroTextBox soundTriggerTime;
    }
}