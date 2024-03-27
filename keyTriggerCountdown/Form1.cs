using System;
using System.Windows.Forms;

namespace keyTriggerCountdown
{
    public partial class Form1 : MetroFramework.Forms.MetroForm
    {
        private GlobalKeyboardHook keyboardHook;
        private int timeLeft; // 倒计时剩余的秒数
        private System.Media.SoundPlayer soundPlayer;


        public Form1()
        {
            InitializeComponent();
            keyboardHook = new GlobalKeyboardHook();
            keyboardHook.OnKeyPressed += keyboardHook_OnKeyPressed;
            soundPlayer = new System.Media.SoundPlayer(Properties.Resources.tick);
        }

        private void keyboardHook_OnKeyPressed(object sender, KeyPressedEventArgs e)
        {
            // 输出按下的键
            Console.WriteLine(e.KeyPressed);

            if (comboBoxTriggerKey.SelectedItem == null)
            {
                return;
            }

            // 如果按下的是F1键，触发按钮的Click事件
            if (e.KeyPressed.ToString() == comboBoxTriggerKey.SelectedItem.ToString())
            {
                startBtn_Click(this, new EventArgs());
            }
        }

        private void Form1_Load(object sender, EventArgs e)
        {
            comboBoxTriggerKey.SelectedIndex = 0;
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            base.OnFormClosed(e);
            keyboardHook.Dispose();
        }


        private void startBtn_Click(object sender, EventArgs e)
        {
            // 尝试从TextBox读取秒数
            if (int.TryParse(secondInput.Text, out timeLeft))
            {
                timer1.Start(); // 开始倒计时
                timeDisplay.Text = timeLeft.ToString(); // 立即更新显示时间
            }
            else
            {
                MessageBox.Show("请输入有效的秒数");
            }
        }

        private void secondInput_Click(object sender, EventArgs e)
        {

        }

        private void timer1_Tick(object sender, EventArgs e)
        {
            if (timeLeft > 0)
            {
                timeLeft--; // 减少剩余秒数
                timeDisplay.Text = timeLeft.ToString(); // 更新显示

                if (timeLeft <= 5)
                {
                    soundPlayer.Play(); // 播放提示音
                }
            }
            else
            {
                // 尝试从textBox1重新解析时间
                if (int.TryParse(secondInput.Text, out timeLeft) && timeLeft > 0)
                {
                    timeDisplay.Text = timeLeft.ToString(); // 立即更新显示时间
                    timer1.Start(); // 重新启动计时器
                }
                else
                {
                    MessageBox.Show("请输入有效的秒数");
                    timer1.Stop(); // 如果解析失败，停止计时器
                }
            }
        }

        private void comboBoxTriggerKey_SelectedIndexChanged(object sender, EventArgs e)
        {
        }

        private void timeDisplay_Click(object sender, EventArgs e)
        {

        }
    }
}
